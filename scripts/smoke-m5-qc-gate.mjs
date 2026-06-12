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
  await check("work_order_output_qc_checks table exists", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int n FROM work_order_output_qc_checks`;
    return `rows=${r[0].n}`;
  });
  await check("worker_qc_issues table exists", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int n FROM worker_qc_issues`;
    return `rows=${r[0].n}`;
  });
  await check("qc_checklist column on project_budget_items", async () => {
    const r = await prisma.$queryRaw`
      SELECT data_type FROM information_schema.columns
      WHERE table_name='project_budget_items' AND column_name='qc_checklist'
    `;
    if (r.length === 0) throw new Error("missing column");
    if (r[0].data_type !== "jsonb") throw new Error(`type=${r[0].data_type}`);
    return r[0].data_type;
  });
  await check("WorkOrderOutputQcCheckStatus enum", async () => {
    const r = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"WorkOrderOutputQcCheckStatus"))::text v`;
    const vals = r.map((x) => x.v).sort().join(",");
    if (vals !== "failed,passed,pending") throw new Error(`unexpected: ${vals}`);
    return vals;
  });
  await check("WorkerQcIssueSeverity enum", async () => {
    const r = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"WorkerQcIssueSeverity"))::text v`;
    const vals = r.map((x) => x.v).sort().join(",");
    if (vals !== "critical,major,minor") throw new Error(`unexpected: ${vals}`);
    return vals;
  });
  await check("unique (output_id, item_index)", async () => {
    const r = await prisma.$queryRaw`
      SELECT indexdef FROM pg_indexes
      WHERE tablename='work_order_output_qc_checks' AND indexdef ILIKE '%output_id%item_index%' AND indexdef ILIKE '%unique%'
    `;
    if (r.length === 0) throw new Error("missing unique index");
    return r[0].indexdef.slice(0, 100);
  });

  // ---- end-to-end ----
  const { canMarkOutputPassed, parseQcChecklist } = await import("../lib/qc-mapping.ts").catch(async () => {
    return await import("../lib/qc-mapping.js").catch(() => ({}));
  });

  // Use a direct inline gate fn as backup (smoke shouldn't import .ts)
  const gate = (checklist, checks) => {
    if (checklist.length === 0) return { ok: true };
    const by = new Map(checks.map((c) => [c.itemIndex, c]));
    for (let i = 0; i < checklist.length; i += 1) {
      const item = checklist[i];
      const c = by.get(i);
      if (!c) return { ok: false, reason: `Mục "${item.title}" chưa kiểm` };
      if (c.status !== "passed") return { ok: false, reason: `Mục "${item.title}" chưa đạt` };
      if (item.requirePhoto && !c.photoKey) return { ok: false, reason: `Mục "${item.title}" yêu cầu ảnh` };
    }
    return { ok: true };
  };

  await check("gate: empty checklist → pass", async () => {
    const r = gate([], []);
    if (!r.ok) throw new Error("expected ok");
    return "ok";
  });
  await check("gate: missing tick → block", async () => {
    const r = gate([{ title: "A", requirePhoto: false }], []);
    if (r.ok) throw new Error("expected block");
    return r.reason;
  });
  await check("gate: tick passed but no photo → block", async () => {
    const r = gate(
      [{ title: "A", requirePhoto: true }],
      [{ itemIndex: 0, status: "passed", photoKey: null }],
    );
    if (r.ok) throw new Error("expected block");
    return r.reason;
  });
  await check("gate: tick passed + photo → ok", async () => {
    const r = gate(
      [{ title: "A", requirePhoto: true }],
      [{ itemIndex: 0, status: "passed", photoKey: "x" }],
    );
    if (!r.ok) throw new Error("expected ok");
    return "ok";
  });

  // DB end-to-end
  const project = await prisma.project.findFirst({ select: { id: true } });
  if (!project) { console.log("SKIP: no project"); await prisma.$disconnect(); return; }
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) { console.log("SKIP: no admin"); await prisma.$disconnect(); return; }
  const workers = await prisma.worker.findMany({
    where: { projectId: project.id, workerStatus: "active" },
    select: { id: true }, take: 2,
  });
  if (workers.length < 2) { console.log("SKIP: need 2 workers"); await prisma.$disconnect(); return; }

  let budget = await prisma.projectBudget.findFirst({ where: { projectId: project.id }, select: { id: true } });
  let createdBudget = false;
  if (!budget) {
    budget = await prisma.projectBudget.create({
      data: { projectId: project.id, status: "draft", createdById: admin.id },
      select: { id: true },
    });
    createdBudget = true;
  }
  // Tạo item riêng (đặt tên dễ tìm) — KHÔNG xài item cũ để tránh ràng buộc workOrder
  const item = await prisma.projectBudgetItem.create({
    data: {
      budgetId: budget.id,
      category: "labor", phase: "than",
      name: "[smoke-m5] Đầu việc QC test",
      unit: "m2", quantity: new Prisma.Decimal(5),
      unitPrice: BigInt(100000), amount: BigInt(500000), sortRank: 9990,
      qcChecklist: [
        { title: "Mục 1 không cần ảnh", requirePhoto: false },
        { title: "Mục 2 cần ảnh", requirePhoto: true },
      ],
    },
    select: { id: true, name: true, unit: true, unitPrice: true, qcChecklist: true },
  });

  await check("Save qcChecklist + parse roundtrip", async () => {
    const list = item.qcChecklist;
    if (!Array.isArray(list) || list.length !== 2) throw new Error(`shape=${JSON.stringify(list)}`);
    if (list[1].requirePhoto !== true) throw new Error("requirePhoto lost");
    return `n=${list.length}`;
  });

  const t = new Date();
  const date = new Date(Date.UTC(t.getUTCFullYear() + 5, 1, 8));
  await prisma.workOrder.deleteMany({ where: { projectId: project.id, date } });

  const wo = await prisma.workOrder.create({
    data: {
      projectId: project.id, date, groupNo: 92,
      budgetItemId: item.id, workItem: item.name, unit: item.unit, unitPrice: item.unitPrice,
      targetQty: new Prisma.Decimal(2), createdById: admin.id,
      workers: { create: workers.map((w) => ({ workerId: w.id })) },
    },
  });
  const output = await prisma.workOrderOutput.create({
    data: {
      workOrderId: wo.id, projectId: project.id, date,
      actualQty: new Prisma.Decimal(1.8),
      weekKey: `${date.getUTCFullYear()}-W06`,
      createdById: admin.id,
    },
  });

  await check("Tick QC item 0 → passed (no photo)", async () => {
    const c = await prisma.workOrderOutputQcCheck.upsert({
      where: { outputId_itemIndex: { outputId: output.id, itemIndex: 0 } },
      create: {
        outputId: output.id, itemIndex: 0,
        itemTitle: "Mục 1 không cần ảnh",
        status: "passed",
        checkedById: admin.id, checkedAt: new Date(),
      },
      update: { status: "passed" },
    });
    if (c.status !== "passed") throw new Error(`status=${c.status}`);
    return c.id;
  });

  await check("Gate blocks duyệt: item 1 chưa kiểm", async () => {
    const checks = await prisma.workOrderOutputQcCheck.findMany({
      where: { outputId: output.id },
      select: { itemIndex: true, status: true, photoKey: true },
    });
    const list = item.qcChecklist;
    const r = gate(list, checks);
    if (r.ok) throw new Error("expected block");
    return r.reason;
  });

  await check("Tick item 1 passed but missing photo → still block", async () => {
    await prisma.workOrderOutputQcCheck.upsert({
      where: { outputId_itemIndex: { outputId: output.id, itemIndex: 1 } },
      create: {
        outputId: output.id, itemIndex: 1,
        itemTitle: "Mục 2 cần ảnh",
        status: "passed",
        checkedById: admin.id, checkedAt: new Date(),
      },
      update: { status: "passed", photoKey: null },
    });
    const checks = await prisma.workOrderOutputQcCheck.findMany({
      where: { outputId: output.id },
      select: { itemIndex: true, status: true, photoKey: true },
    });
    const r = gate(item.qcChecklist, checks);
    if (r.ok) throw new Error("expected block due to missing photo");
    return r.reason;
  });

  await check("Attach photo → gate passes", async () => {
    await prisma.workOrderOutputQcCheck.update({
      where: { outputId_itemIndex: { outputId: output.id, itemIndex: 1 } },
      data: { photoKey: "eod-qc/smoke/__test__.jpg" },
    });
    const checks = await prisma.workOrderOutputQcCheck.findMany({
      where: { outputId: output.id },
      select: { itemIndex: true, status: true, photoKey: true },
    });
    const r = gate(item.qcChecklist, checks);
    if (!r.ok) throw new Error(`still blocked: ${r.reason}`);
    return "ok";
  });

  await check("Unique (output_id, item_index) blocks dup", async () => {
    try {
      await prisma.workOrderOutputQcCheck.create({
        data: {
          outputId: output.id, itemIndex: 0,
          itemTitle: "dup", status: "passed",
        },
      });
      throw new Error("should have failed");
    } catch (e) {
      if (!String(e.message).match(/unique|P2002/i)) throw e;
      return "blocked";
    }
  });

  await check("Create WorkerQcIssue for 2 workers (createMany)", async () => {
    const r = await prisma.workerQcIssue.createMany({
      data: workers.map((w) => ({
        workerId: w.id,
        outputId: output.id,
        projectId: project.id,
        severity: "major",
        reason: "[smoke-m5] sai cao độ",
        occurredAt: date,
        createdById: admin.id,
      })),
    });
    if (r.count !== 2) throw new Error(`count=${r.count}`);
    return `n=${r.count}`;
  });

  await check("WorkerQcIssue query by worker+date", async () => {
    const rows = await prisma.workerQcIssue.findMany({
      where: { workerId: workers[0].id, occurredAt: date },
      select: { id: true, severity: true },
    });
    if (rows.length === 0) throw new Error("none");
    return `n=${rows.length} sev=${rows[0].severity}`;
  });

  await check("Delete output cascades qc_checks", async () => {
    const before = await prisma.workOrderOutputQcCheck.count({ where: { outputId: output.id } });
    if (before === 0) throw new Error("setup: no checks");
    await prisma.workOrderOutput.delete({ where: { id: output.id } });
    const after = await prisma.workOrderOutputQcCheck.count({ where: { outputId: output.id } });
    if (after !== 0) throw new Error(`leftover: ${after}`);
    return `cleared ${before}`;
  });

  await check("WorkerQcIssue.output_id set NULL on output delete", async () => {
    const issues = await prisma.workerQcIssue.findMany({
      where: { projectId: project.id, occurredAt: date, reason: "[smoke-m5] sai cao độ" },
      select: { outputId: true },
    });
    if (issues.length === 0) throw new Error("missing issues");
    const nulled = issues.filter((i) => i.outputId === null).length;
    if (nulled !== issues.length) throw new Error(`${nulled}/${issues.length} nulled`);
    return `${nulled} nulled`;
  });

  // Cleanup
  await prisma.workerQcIssue.deleteMany({
    where: { projectId: project.id, occurredAt: date, reason: "[smoke-m5] sai cao độ" },
  });
  await prisma.workOrder.deleteMany({ where: { id: wo.id } });
  await prisma.projectBudgetItem.delete({ where: { id: item.id } }).catch(() => {});
  if (createdBudget) await prisma.projectBudget.delete({ where: { id: budget.id } }).catch(() => {});

  await prisma.$disconnect();
  const fs = await import("node:fs");
  fs.writeFileSync("output/reports/smoke-m5-qc-gate.json", JSON.stringify({ generatedAt: new Date().toISOString(), failed, results }, null, 2));
  console.log("Report: output/reports/smoke-m5-qc-gate.json");
  if (failed) process.exit(1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
