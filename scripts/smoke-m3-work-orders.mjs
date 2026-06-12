import { config } from "dotenv";
config({ path: ".env.production", override: false });

const { PrismaClient, Prisma } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { Pool } = await import("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const results = [];
let failed = false;

async function check(name, fn) {
  try {
    const out = await fn();
    console.log(`PASS: ${name}${out ? " — " + out : ""}`);
    results.push({ name, ok: true, detail: out ?? "" });
    return true;
  } catch (e) {
    console.log(`FAIL: ${name} — ${e.message}`);
    results.push({ name, ok: false, detail: e.message });
    failed = true;
    return false;
  }
}

async function main() {
  await check("DB connects", async () => {
    const r = await prisma.$queryRaw`SELECT 1 as ok`;
    return `1=${r[0].ok}`;
  });

  await check("work_orders table exists", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int as n FROM work_orders`;
    return `rows=${r[0].n}`;
  });

  await check("work_order_workers table exists", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int as n FROM work_order_workers`;
    return `rows=${r[0].n}`;
  });

  await check("WorkOrderStatus enum present", async () => {
    const r = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"WorkOrderStatus"))::text AS v`;
    const vals = r.map((x) => x.v).sort().join(",");
    if (vals !== "carried,done,open") throw new Error(`unexpected: ${vals}`);
    return vals;
  });

  await check("unique (project_id,date,group_no) constraint", async () => {
    const r = await prisma.$queryRaw`
      SELECT indexdef FROM pg_indexes
      WHERE tablename='work_orders' AND indexdef ILIKE '%project_id%date%group_no%'
    `;
    if (r.length === 0) throw new Error("missing unique index");
    return r[0].indexdef;
  });

  await check("unique (work_order_id,worker_id) constraint", async () => {
    const r = await prisma.$queryRaw`
      SELECT indexdef FROM pg_indexes
      WHERE tablename='work_order_workers' AND indexdef ILIKE '%work_order_id%worker_id%' AND indexdef ILIKE '%unique%'
    `;
    if (r.length === 0) throw new Error("missing unique index");
    return r[0].indexdef;
  });

  // End-to-end Prisma flow
  const project = await prisma.project.findFirst({ select: { id: true, code: true } });
  if (!project) {
    console.log("SKIP: no project");
    return;
  }

  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) {
    console.log("SKIP: no admin");
    return;
  }

  // Ensure two active workers
  let workers = await prisma.worker.findMany({
    where: { projectId: project.id, workerStatus: "active" },
    select: { id: true, fullName: true },
    take: 3,
  });
  if (workers.length < 2) {
    console.log("SKIP: need at least 2 active workers on first project");
    await prisma.$disconnect();
    return;
  }

  // Ensure a labor budget item exists. Create a transient budget+item if missing.
  let budget = await prisma.projectBudget.findFirst({ where: { projectId: project.id }, select: { id: true } });
  let createdBudget = false;
  let createdItem = null;
  if (!budget) {
    budget = await prisma.projectBudget.create({
      data: { projectId: project.id, status: "draft", createdById: admin.id },
      select: { id: true },
    });
    createdBudget = true;
  }
  let item = await prisma.projectBudgetItem.findFirst({
    where: { budgetId: budget.id, category: "labor" },
    select: { id: true, name: true, unit: true, unitPrice: true, quantity: true },
  });
  if (!item) {
    item = await prisma.projectBudgetItem.create({
      data: {
        budgetId: budget.id,
        category: "labor",
        phase: "mong",
        name: "[smoke-m3] Đào móng thử",
        unit: "m3",
        quantity: new Prisma.Decimal(10),
        unitPrice: BigInt(150000),
        amount: BigInt(1500000),
        sortRank: 9999,
      },
      select: { id: true, name: true, unit: true, unitPrice: true, quantity: true },
    });
    createdItem = item;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // Use a far-future date for isolation
  const date = new Date(Date.UTC(today.getUTCFullYear() + 5, today.getUTCMonth(), today.getUTCDate()));
  const nextDate = new Date(date.getTime() + 86400000);

  // Cleanup any leftovers from previous run
  await prisma.workOrder.deleteMany({ where: { projectId: project.id, date: { in: [date, nextDate] } } });

  let woId = null;
  let woId2 = null;

  await check("Prisma WorkOrder create with workers", async () => {
    const wo = await prisma.workOrder.create({
      data: {
        projectId: project.id,
        date,
        groupNo: 1,
        budgetItemId: item.id,
        workItem: item.name,
        unit: item.unit,
        unitPrice: item.unitPrice,
        targetQty: new Prisma.Decimal(3),
        createdById: admin.id,
        workers: { create: [{ workerId: workers[0].id }, { workerId: workers[1].id }] },
      },
      include: { workers: true },
    });
    woId = wo.id;
    if (wo.workers.length !== 2) throw new Error(`expected 2 workers, got ${wo.workers.length}`);
    return `wo=${wo.id} workers=${wo.workers.length}`;
  });

  await check("Unique (project,date,groupNo) blocks dup", async () => {
    try {
      await prisma.workOrder.create({
        data: {
          projectId: project.id,
          date,
          groupNo: 1,
          budgetItemId: item.id,
          workItem: item.name,
          unit: item.unit,
          unitPrice: item.unitPrice,
          targetQty: new Prisma.Decimal(2),
          createdById: admin.id,
        },
      });
      throw new Error("should have failed");
    } catch (e) {
      if (!String(e.message).match(/unique|P2002/i)) throw e;
      return "blocked";
    }
  });

  await check("Second groupNo same day OK", async () => {
    const wo = await prisma.workOrder.create({
      data: {
        projectId: project.id,
        date,
        groupNo: 2,
        budgetItemId: item.id,
        workItem: item.name,
        unit: item.unit,
        unitPrice: item.unitPrice,
        targetQty: new Prisma.Decimal(4),
        createdById: admin.id,
        workers: workers[2] ? { create: [{ workerId: workers[2].id }] } : undefined,
      },
    });
    woId2 = wo.id;
    return `wo2=${wo.id}`;
  });

  await check("groupBy cumulative targetQty works", async () => {
    const sums = await prisma.workOrder.groupBy({
      by: ["budgetItemId"],
      where: { projectId: project.id, budgetItemId: item.id },
      _sum: { targetQty: true },
    });
    const n = Number(sums[0]?._sum.targetQty ?? 0);
    if (n !== 7) throw new Error(`expected 7, got ${n}`);
    return `sum=${n}`;
  });

  await check("Update status + targetQty", async () => {
    await prisma.workOrder.update({
      where: { id: woId },
      data: { status: "done", targetQty: new Prisma.Decimal(5) },
    });
    const wo = await prisma.workOrder.findUnique({ where: { id: woId }, select: { status: true, targetQty: true } });
    if (wo.status !== "done" || Number(wo.targetQty) !== 5) throw new Error(`got ${JSON.stringify(wo)}`);
    return `status=${wo.status} qty=${Number(wo.targetQty)}`;
  });

  await check("Replace workers on existing order", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.workOrderWorker.deleteMany({ where: { workOrderId: woId } });
      await tx.workOrderWorker.createMany({ data: [{ workOrderId: woId, workerId: workers[1].id }] });
    });
    const fresh = await prisma.workOrder.findUnique({ where: { id: woId }, include: { workers: true } });
    if (fresh.workers.length !== 1) throw new Error(`expected 1 worker, got ${fresh.workers.length}`);
    return `workers=${fresh.workers.length}`;
  });

  await check("Delete cascades work_order_workers", async () => {
    await prisma.workOrder.delete({ where: { id: woId } });
    const left = await prisma.workOrderWorker.count({ where: { workOrderId: woId } });
    if (left !== 0) throw new Error(`leftover workers: ${left}`);
    return "ok";
  });

  await check("Activity log entity=work_order accepted", async () => {
    const log = await prisma.projectActivityLog.create({
      data: {
        projectId: project.id,
        actorId: admin.id,
        entity: "work_order",
        action: "create",
        summary: "smoke-m3 activity log",
      },
    });
    await prisma.projectActivityLog.delete({ where: { id: log.id } });
    return "ok";
  });

  // Cleanup
  await prisma.workOrder.deleteMany({ where: { projectId: project.id, date: { in: [date, nextDate] } } });
  if (createdItem) await prisma.projectBudgetItem.delete({ where: { id: createdItem.id } }).catch(() => {});
  if (createdBudget) await prisma.projectBudget.delete({ where: { id: budget.id } }).catch(() => {});

  await prisma.$disconnect();

  const report = { generatedAt: new Date().toISOString(), failed, results };
  const fs = await import("node:fs");
  fs.writeFileSync("output/reports/smoke-m3-work-orders.json", JSON.stringify(report, null, 2));
  console.log(`Report: output/reports/smoke-m3-work-orders.json`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
