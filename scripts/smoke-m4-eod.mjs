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
  } catch (e) {
    console.log(`FAIL: ${name} — ${e.message}`);
    results.push({ name, ok: false, detail: e.message });
    failed = true;
  }
}

async function main() {
  await check("worker_timesheets exists", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int n FROM worker_timesheets`;
    return `rows=${r[0].n}`;
  });
  await check("work_order_outputs exists", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int n FROM work_order_outputs`;
    return `rows=${r[0].n}`;
  });
  await check("work_order_output_photos exists", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int n FROM work_order_output_photos`;
    return `rows=${r[0].n}`;
  });
  await check("TimesheetAbsentReason enum", async () => {
    const r = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"TimesheetAbsentReason"))::text v`;
    const vals = r.map((x) => x.v).sort().join(",");
    if (vals !== "CHO,KP,MUA,P") throw new Error(`unexpected: ${vals}`);
    return vals;
  });
  await check("WorkOrderOutputQcStatus enum", async () => {
    const r = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"WorkOrderOutputQcStatus"))::text v`;
    const vals = r.map((x) => x.v).sort().join(",");
    if (vals !== "failed,passed,pending,rework") throw new Error(`unexpected: ${vals}`);
    return vals;
  });
  await check("unique (worker_id, date) on timesheets", async () => {
    const r = await prisma.$queryRaw`
      SELECT indexdef FROM pg_indexes
      WHERE tablename='worker_timesheets' AND indexdef ILIKE '%worker_id%date%' AND indexdef ILIKE '%unique%'
    `;
    if (r.length === 0) throw new Error("missing unique index");
    return r[0].indexdef.slice(0, 90);
  });
  await check("unique (work_order_id) on outputs", async () => {
    const r = await prisma.$queryRaw`
      SELECT indexdef FROM pg_indexes
      WHERE tablename='work_order_outputs' AND indexdef ILIKE '%work_order_id%' AND indexdef ILIKE '%unique%'
    `;
    if (r.length === 0) throw new Error("missing unique index");
    return r[0].indexdef.slice(0, 90);
  });

  // End-to-end: cần project + worker + work order
  const project = await prisma.project.findFirst({ select: { id: true } });
  if (!project) { console.log("SKIP: no project"); await prisma.$disconnect(); return; }
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) { console.log("SKIP: no admin"); await prisma.$disconnect(); return; }
  const workers = await prisma.worker.findMany({
    where: { projectId: project.id, workerStatus: "active" },
    select: { id: true }, take: 2,
  });
  if (workers.length < 2) { console.log("SKIP: need 2 workers"); await prisma.$disconnect(); return; }

  // Ensure a labor budget item + work order on test date
  let budget = await prisma.projectBudget.findFirst({ where: { projectId: project.id }, select: { id: true } });
  let createdBudget = false;
  let item = null;
  let createdItem = null;
  if (!budget) {
    budget = await prisma.projectBudget.create({
      data: { projectId: project.id, status: "draft", createdById: admin.id },
      select: { id: true },
    });
    createdBudget = true;
  }
  item = await prisma.projectBudgetItem.findFirst({
    where: { budgetId: budget.id, category: "labor" },
    select: { id: true, name: true, unit: true, unitPrice: true },
  });
  if (!item) {
    item = await prisma.projectBudgetItem.create({
      data: {
        budgetId: budget.id,
        category: "labor", phase: "mong",
        name: "[smoke-m4] Đào móng test",
        unit: "m3", quantity: new Prisma.Decimal(10),
        unitPrice: BigInt(150000), amount: BigInt(1500000), sortRank: 9998,
      },
      select: { id: true, name: true, unit: true, unitPrice: true },
    });
    createdItem = item;
  }

  const t = new Date();
  const date = new Date(Date.UTC(t.getUTCFullYear() + 5, 0, 8)); // 5 năm sau, 8/1 — luôn rảnh
  // Cleanup previous
  await prisma.workOrder.deleteMany({ where: { projectId: project.id, date } });
  await prisma.workerTimesheet.deleteMany({ where: { projectId: project.id, date } });

  let woId, outputId, tsId;

  await check("Create WorkOrder for smoke", async () => {
    const wo = await prisma.workOrder.create({
      data: {
        projectId: project.id, date, groupNo: 91,
        budgetItemId: item.id, workItem: item.name, unit: item.unit, unitPrice: item.unitPrice,
        targetQty: new Prisma.Decimal(2), createdById: admin.id,
        workers: { create: [{ workerId: workers[0].id }, { workerId: workers[1].id }] },
      },
    });
    woId = wo.id;
    return `wo=${wo.id}`;
  });

  await check("Upsert WorkerTimesheet (1 công, dùng dayValue=1.0)", async () => {
    const ts = await prisma.workerTimesheet.upsert({
      where: { workerId_date: { workerId: workers[0].id, date } },
      create: {
        projectId: project.id, workerId: workers[0].id, date,
        dayValue: new Prisma.Decimal(1), weekKey: `${date.getUTCFullYear()}-W02`,
        createdById: admin.id,
      },
      update: { dayValue: new Prisma.Decimal(1) },
    });
    tsId = ts.id;
    return `ts=${ts.id} dv=${Number(ts.dayValue)}`;
  });

  await check("Upsert WorkerTimesheet vắng (0 công, MUA)", async () => {
    const ts = await prisma.workerTimesheet.upsert({
      where: { workerId_date: { workerId: workers[1].id, date } },
      create: {
        projectId: project.id, workerId: workers[1].id, date,
        dayValue: new Prisma.Decimal(0), absentReason: "MUA",
        weekKey: `${date.getUTCFullYear()}-W02`, createdById: admin.id,
      },
      update: { dayValue: new Prisma.Decimal(0), absentReason: "MUA" },
    });
    return `reason=${ts.absentReason}`;
  });

  await check("Unique (worker_id, date) blocks dup timesheet", async () => {
    try {
      await prisma.workerTimesheet.create({
        data: {
          projectId: project.id, workerId: workers[0].id, date,
          dayValue: new Prisma.Decimal(0.5), weekKey: `${date.getUTCFullYear()}-W02`,
          createdById: admin.id,
        },
      });
      throw new Error("should have failed");
    } catch (e) {
      if (!String(e.message).match(/unique|P2002/i)) throw e;
      return "blocked";
    }
  });

  await check("Create WorkOrderOutput (pending QC)", async () => {
    const out = await prisma.workOrderOutput.create({
      data: {
        workOrderId: woId, projectId: project.id, date,
        actualQty: new Prisma.Decimal(1.5),
        weekKey: `${date.getUTCFullYear()}-W02`,
        createdById: admin.id,
      },
    });
    outputId = out.id;
    if (out.qcStatus !== "pending") throw new Error(`status=${out.qcStatus}`);
    return `out=${out.id} qc=${out.qcStatus}`;
  });

  await check("Unique work_order_id blocks 2nd output", async () => {
    try {
      await prisma.workOrderOutput.create({
        data: {
          workOrderId: woId, projectId: project.id, date,
          actualQty: new Prisma.Decimal(0.5), weekKey: `${date.getUTCFullYear()}-W02`,
          createdById: admin.id,
        },
      });
      throw new Error("should have failed");
    } catch (e) {
      if (!String(e.message).match(/unique|P2002/i)) throw e;
      return "blocked";
    }
  });

  await check("Approve output → passed + approvedQty", async () => {
    const out = await prisma.workOrderOutput.update({
      where: { id: outputId },
      data: {
        qcStatus: "passed",
        approvedQty: new Prisma.Decimal(1.4),
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });
    if (out.qcStatus !== "passed" || Number(out.approvedQty) !== 1.4) throw new Error(`got ${out.qcStatus} / ${out.approvedQty}`);
    return "ok";
  });

  await check("Add output photo", async () => {
    const p = await prisma.workOrderOutputPhoto.create({
      data: {
        outputId, storageKey: "eod/smoke/__test__.jpg",
        contentType: "image/jpeg", sortRank: 0,
        uploadedById: admin.id,
      },
    });
    if (!p.id) throw new Error("no id");
    return `photo=${p.id}`;
  });

  await check("Delete output cascades photo", async () => {
    await prisma.workOrderOutput.delete({ where: { id: outputId } });
    const left = await prisma.workOrderOutputPhoto.count({ where: { outputId } });
    if (left !== 0) throw new Error(`leftover photos: ${left}`);
    return "ok";
  });

  await check("groupBy weekKey for payroll readiness", async () => {
    const sums = await prisma.workerTimesheet.groupBy({
      by: ["weekKey"],
      where: { projectId: project.id, date },
      _sum: { dayValue: true },
    });
    if (sums.length === 0) throw new Error("no rows");
    return `weeks=${sums.length} totalDays=${Number(sums[0]._sum.dayValue)}`;
  });

  // Cleanup
  await prisma.workerTimesheet.deleteMany({ where: { projectId: project.id, date } });
  await prisma.workOrder.deleteMany({ where: { id: woId } });
  if (createdItem) await prisma.projectBudgetItem.delete({ where: { id: createdItem.id } }).catch(() => {});
  if (createdBudget) await prisma.projectBudget.delete({ where: { id: budget.id } }).catch(() => {});

  await prisma.$disconnect();
  const fs = await import("node:fs");
  fs.writeFileSync("output/reports/smoke-m4-eod.json", JSON.stringify({ generatedAt: new Date().toISOString(), failed, results }, null, 2));
  console.log("Report: output/reports/smoke-m4-eod.json");
  if (failed) process.exit(1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
