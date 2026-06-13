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

// Inline replicas of lib/weekly-payroll.ts for smoke (cannot import .ts).
const SHARE_RATE = 0.5;
const NEG_STREAK_RAINY_THRESHOLD = 3;
function calcWeeklyPayroll(input) {
  const shareRate = input.shareRate ?? SHARE_RATE;
  const workerById = new Map(input.workers.map((w) => [w.id, w]));
  const accumByWorker = new Map();
  for (const t of input.timesheets) {
    let a = accumByWorker.get(t.workerId);
    if (!a) { a = { days: 0, p: 0, kp: 0, mua: 0, cho: 0 }; accumByWorker.set(t.workerId, a); }
    a.days += t.dayValue;
    if (t.dayValue === 0 && t.absentReason) {
      if (t.absentReason === "P") a.p += 1;
      else if (t.absentReason === "KP") a.kp += 1;
      else if (t.absentReason === "MUA") a.mua += 1;
      else if (t.absentReason === "CHO") a.cho += 1;
    }
  }
  const dailyWageByWorker = new Map();
  for (const [wid, acc] of accumByWorker) {
    const w = workerById.get(wid);
    dailyWageByWorker.set(wid, Math.round((w?.dailyRate ?? 0) * acc.days));
  }
  const totalDailyWage = [...dailyWageByWorker.values()].reduce((s, n) => s + n, 0);
  const totalDays = [...accumByWorker.values()].reduce((s, a) => s + a.days, 0);
  const totalOutputValue = input.outputs.reduce((s, o) => s + Math.round(o.approvedQty * o.unitPrice), 0);
  const weekDelta = totalOutputValue - totalDailyWage;
  const carryoverPrev = (input.prevCarryover ?? 0) + weekDelta;
  let bonusPool = 0;
  let carryoverNew = carryoverPrev;
  if (carryoverPrev > 0) {
    bonusPool = Math.floor(carryoverPrev * shareRate);
    carryoverNew = carryoverPrev - bonusPool;
  }
  const weights = new Map();
  let totalWeight = 0;
  for (const [wid, acc] of accumByWorker) {
    const w = workerById.get(wid);
    const wt = (w?.dailyRate ?? 0) * acc.days;
    weights.set(wid, wt);
    totalWeight += wt;
  }
  const bonusByWorker = new Map();
  let allocatedBonus = 0;
  let topWorker = null, topWeight = -1;
  for (const [wid, wt] of weights) {
    const share = totalWeight > 0 ? Math.floor((bonusPool * wt) / totalWeight) : 0;
    bonusByWorker.set(wid, share);
    allocatedBonus += share;
    if (wt > topWeight) { topWeight = wt; topWorker = wid; }
  }
  if (bonusPool > allocatedBonus && topWorker) {
    bonusByWorker.set(topWorker, (bonusByWorker.get(topWorker) ?? 0) + (bonusPool - allocatedBonus));
  }
  const adjByWorker = new Map();
  for (const a of input.adjustments ?? []) {
    adjByWorker.set(a.workerId, (adjByWorker.get(a.workerId) ?? 0) + Math.round(a.amount));
  }
  const lines = [];
  for (const [wid, acc] of accumByWorker) {
    const w = workerById.get(wid);
    const dailyWage = dailyWageByWorker.get(wid) ?? 0;
    const bonus = bonusByWorker.get(wid) ?? 0;
    const adjustment = adjByWorker.get(wid) ?? 0;
    lines.push({
      workerId: wid, totalDays: acc.days,
      dailyRate: w?.dailyRate ?? 0, dailyWage, bonus, adjustment,
      payable: dailyWage + bonus + adjustment,
      absentDaysP: acc.p, absentDaysKp: acc.kp, absentDaysMua: acc.mua, absentDaysCho: acc.cho,
    });
  }
  for (const [wid, amount] of adjByWorker) {
    if (accumByWorker.has(wid)) continue;
    const w = workerById.get(wid);
    lines.push({
      workerId: wid, totalDays: 0,
      dailyRate: w?.dailyRate ?? 0, dailyWage: 0, bonus: 0, adjustment: amount, payable: amount,
      absentDaysP: 0, absentDaysKp: 0, absentDaysMua: 0, absentDaysCho: 0,
    });
  }
  const totalPayable = lines.reduce((s, l) => s + l.payable, 0);
  return {
    totalDays, totalDailyWage, totalOutputValue, weekDelta,
    carryoverPrev, carryoverNew, bonusPool, totalBonus: bonusPool,
    totalPayable, shareRate, lines,
  };
}
function computeNegativeStreak(prev, delta, mua, cho) {
  if (mua + cho >= NEG_STREAK_RAINY_THRESHOLD) return prev;
  if (delta < 0) return prev + 1;
  return 0;
}
function buildBankCsv(rows, weekKey, code) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["STT","Ho ten","So tai khoan","Ngan hang","So tien","Noi dung"].map(esc).join(",")];
  rows.forEach((r, i) => {
    lines.push([String(i+1), r.fullName, r.bankAccount ?? "", r.bankName ?? "", String(r.payable), `Luong ${weekKey} ${code}`].map(esc).join(","));
  });
  return "﻿" + lines.join("\r\n") + "\r\n";
}

async function main() {
  // -------- Schema checks --------
  await check("weekly_payrolls table", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int n FROM weekly_payrolls`;
    return `rows=${r[0].n}`;
  });
  await check("weekly_payroll_lines table", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int n FROM weekly_payroll_lines`;
    return `rows=${r[0].n}`;
  });
  await check("weekly_payroll_adjustments table", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int n FROM weekly_payroll_adjustments`;
    return `rows=${r[0].n}`;
  });
  await check("WeeklyPayrollStatus enum", async () => {
    const r = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"WeeklyPayrollStatus"))::text v`;
    const vals = r.map((x) => x.v).sort().join(",");
    if (vals !== "draft,paid,ready_to_pay") throw new Error(`unexpected: ${vals}`);
    return vals;
  });
  await check("unique (project_id, week_key) on weekly_payrolls", async () => {
    const r = await prisma.$queryRaw`
      SELECT indexdef FROM pg_indexes
      WHERE tablename='weekly_payrolls' AND indexdef ILIKE '%project_id%week_key%' AND indexdef ILIKE '%unique%'
    `;
    if (r.length === 0) throw new Error("missing unique index");
    return r[0].indexdef.slice(0, 100);
  });
  await check("unique (payroll_id, worker_id) on weekly_payroll_lines", async () => {
    const r = await prisma.$queryRaw`
      SELECT indexdef FROM pg_indexes
      WHERE tablename='weekly_payroll_lines' AND indexdef ILIKE '%payroll_id%worker_id%' AND indexdef ILIKE '%unique%'
    `;
    if (r.length === 0) throw new Error("missing unique index");
    return r[0].indexdef.slice(0, 100);
  });

  // -------- Calc logic --------
  await check("calc: empty input", () => {
    const r = calcWeeklyPayroll({ workers: [], timesheets: [], outputs: [] });
    if (r.totalDailyWage !== 0 || r.totalOutputValue !== 0 || r.weekDelta !== 0) throw new Error(JSON.stringify(r));
    if (r.lines.length !== 0) throw new Error("expected no lines");
    return "ok";
  });

  await check("calc: positive delta → bonusPool = floor(delta * 0.5)", () => {
    const workers = [
      { id: "w1", fullName: "A", grade: 1, dailyRate: 300000, bankAccount: null, bankName: null, phone: null },
      { id: "w2", fullName: "B", grade: 2, dailyRate: 400000, bankAccount: null, bankName: null, phone: null },
    ];
    const r = calcWeeklyPayroll({
      workers,
      timesheets: [
        { workerId: "w1", dayValue: 1, absentReason: null },
        { workerId: "w1", dayValue: 1, absentReason: null },
        { workerId: "w2", dayValue: 1, absentReason: null },
        { workerId: "w2", dayValue: 1, absentReason: null },
        { workerId: "w2", dayValue: 1, absentReason: null },
      ],
      outputs: [{ workOrderId: "wo1", approvedQty: 10, unitPrice: 250000 }],
    });
    // dailyWage = 2*300k + 3*400k = 1.8M; output = 2.5M; delta = 700k; bonus = 350k
    if (r.totalDailyWage !== 1800000) throw new Error(`dailyWage=${r.totalDailyWage}`);
    if (r.totalOutputValue !== 2500000) throw new Error(`output=${r.totalOutputValue}`);
    if (r.weekDelta !== 700000) throw new Error(`delta=${r.weekDelta}`);
    if (r.bonusPool !== 350000) throw new Error(`pool=${r.bonusPool}`);
    if (r.carryoverNew !== 350000) throw new Error(`carryover=${r.carryoverNew}`);
    // Bonus weights: w1=2*300k=600k, w2=3*400k=1.2M, total=1.8M
    // w1 share = floor(350k * 600k / 1.8M) = floor(116666.67) = 116666
    // w2 share = floor(350k * 1.2M / 1.8M) = floor(233333.33) = 233333
    // remainder = 350000 - (116666+233333) = 1 → goes to w2 (top weight)
    const w1 = r.lines.find((l) => l.workerId === "w1");
    const w2 = r.lines.find((l) => l.workerId === "w2");
    if (w1.bonus + w2.bonus !== 350000) throw new Error(`bonus sum=${w1.bonus + w2.bonus}`);
    if (w2.bonus <= w1.bonus) throw new Error(`expected w2.bonus > w1.bonus`);
    return `w1=${w1.bonus} w2=${w2.bonus}`;
  });

  await check("calc: negative delta → bonusPool=0, carryoverNew=delta", () => {
    const r = calcWeeklyPayroll({
      workers: [{ id: "w1", dailyRate: 500000, fullName: "X", grade: 1, bankAccount: null, bankName: null, phone: null }],
      timesheets: [{ workerId: "w1", dayValue: 1, absentReason: null }, { workerId: "w1", dayValue: 1, absentReason: null }],
      outputs: [{ workOrderId: "wo", approvedQty: 1, unitPrice: 100000 }],
    });
    // wage = 1M; output = 100k; delta = -900k; bonusPool = 0; carryoverNew = -900k
    if (r.weekDelta !== -900000) throw new Error(`delta=${r.weekDelta}`);
    if (r.bonusPool !== 0) throw new Error(`pool=${r.bonusPool}`);
    if (r.carryoverNew !== -900000) throw new Error(`carryover=${r.carryoverNew}`);
    return "ok";
  });

  await check("calc: prevCarryover + weekDelta becomes positive → bonus", () => {
    const r = calcWeeklyPayroll({
      workers: [{ id: "w1", dailyRate: 300000, fullName: "Z", grade: 1, bankAccount: null, bankName: null, phone: null }],
      timesheets: [{ workerId: "w1", dayValue: 1, absentReason: null }],
      outputs: [{ workOrderId: "wo", approvedQty: 1, unitPrice: 400000 }],
      prevCarryover: 200000, // prev surplus
    });
    // wage = 300k; output = 400k; delta = 100k; carryoverPrev (chained) = 300k; bonus = 150k
    if (r.weekDelta !== 100000) throw new Error(`delta=${r.weekDelta}`);
    if (r.carryoverPrev !== 300000) throw new Error(`prev=${r.carryoverPrev}`);
    if (r.bonusPool !== 150000) throw new Error(`pool=${r.bonusPool}`);
    return `pool=${r.bonusPool}`;
  });

  await check("calc: adjustment for worker without timesheet → standalone line", () => {
    const r = calcWeeklyPayroll({
      workers: [
        { id: "w1", dailyRate: 300000, fullName: "A", grade: 1, bankAccount: null, bankName: null, phone: null },
        { id: "w2", dailyRate: 0, fullName: "B (refund)", grade: 1, bankAccount: null, bankName: null, phone: null },
      ],
      timesheets: [{ workerId: "w1", dayValue: 1, absentReason: null }],
      outputs: [],
      adjustments: [{ workerId: "w2", amount: 50000 }],
    });
    const w2 = r.lines.find((l) => l.workerId === "w2");
    if (!w2) throw new Error("missing standalone line");
    if (w2.payable !== 50000) throw new Error(`payable=${w2.payable}`);
    return "ok";
  });

  await check("calc: absent reasons counted", () => {
    const r = calcWeeklyPayroll({
      workers: [{ id: "w1", dailyRate: 300000, fullName: "X", grade: 1, bankAccount: null, bankName: null, phone: null }],
      timesheets: [
        { workerId: "w1", dayValue: 1, absentReason: null },
        { workerId: "w1", dayValue: 0, absentReason: "P" },
        { workerId: "w1", dayValue: 0, absentReason: "MUA" },
        { workerId: "w1", dayValue: 0, absentReason: "MUA" },
        { workerId: "w1", dayValue: 0, absentReason: "CHO" },
      ],
      outputs: [],
    });
    const l = r.lines[0];
    if (l.absentDaysP !== 1 || l.absentDaysMua !== 2 || l.absentDaysCho !== 1) throw new Error(JSON.stringify(l));
    return `P=${l.absentDaysP} MUA=${l.absentDaysMua} CHO=${l.absentDaysCho}`;
  });

  // -------- negStreak --------
  await check("negStreak: delta<0, no rain → +1", () => {
    if (computeNegativeStreak(2, -100, 0, 0) !== 3) throw new Error("expected 3");
    return "ok";
  });
  await check("negStreak: delta>=0 → reset 0", () => {
    if (computeNegativeStreak(5, 0, 0, 0) !== 0) throw new Error("expected 0");
    return "ok";
  });
  await check("negStreak: rainy ≥ threshold → keep prev (skip)", () => {
    if (computeNegativeStreak(3, -100, 2, 1) !== 3) throw new Error("expected unchanged");
    return "ok";
  });

  // -------- CSV --------
  await check("CSV: BOM + header + row + CRLF", () => {
    const csv = buildBankCsv(
      [{ fullName: "Nguyễn Văn A", bankAccount: "123", bankName: "VCB", payable: 500000 }],
      "2026-W24", "HG6-01",
    );
    if (csv.charCodeAt(0) !== 0xFEFF) throw new Error("missing BOM");
    if (!csv.includes("\"Nguyễn Văn A\"")) throw new Error("missing name");
    if (!csv.includes("500000")) throw new Error("missing amount");
    if (!csv.includes("\r\n")) throw new Error("missing CRLF");
    if (!csv.includes("Luong 2026-W24 HG6-01")) throw new Error("missing memo");
    return "ok";
  });

  // -------- E2E: DB roundtrip --------
  const project = await prisma.project.findFirst({ select: { id: true, code: true } });
  if (!project) { console.log("SKIP: no project"); await prisma.$disconnect(); return; }
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) { console.log("SKIP: no admin"); await prisma.$disconnect(); return; }
  const worker = await prisma.worker.findFirst({ where: { projectId: project.id }, select: { id: true, fullName: true, dailyRate: true } });
  if (!worker) { console.log("SKIP: no worker"); await prisma.$disconnect(); return; }

  const SMOKE_WEEK_KEY = "2099-W52"; // unique-ish future
  await prisma.weeklyPayroll.deleteMany({ where: { projectId: project.id, weekKey: SMOKE_WEEK_KEY } });
  await prisma.weeklyPayrollAdjustment.deleteMany({
    where: { projectId: project.id, reason: "[smoke-m6] test adj" },
  });

  const wkStart = new Date(Date.UTC(2099, 11, 21));
  const wkEnd = new Date(Date.UTC(2099, 11, 27));

  await check("Create WeeklyPayroll + Line", async () => {
    const p = await prisma.weeklyPayroll.create({
      data: {
        projectId: project.id, weekKey: SMOKE_WEEK_KEY,
        weekStart: wkStart, weekEnd: wkEnd, status: "draft",
        totalDays: new Prisma.Decimal(1), totalDailyWage: BigInt(300000),
        totalOutputValue: BigInt(400000), weekDelta: BigInt(100000),
        carryoverPrev: BigInt(100000), carryoverNew: BigInt(50000),
        bonusPool: BigInt(50000), shareRate: new Prisma.Decimal(0.5),
        totalBonus: BigInt(50000), totalPayable: BigInt(350000),
        negStreak: 0, closedById: admin.id,
        lines: { create: [{
          workerId: worker.id, fullName: worker.fullName, grade: null,
          bankAccount: null, bankName: null, phone: null,
          totalDays: new Prisma.Decimal(1), dailyRate: BigInt(300000),
          dailyWage: BigInt(300000), bonus: BigInt(50000),
          adjustment: BigInt(0), payable: BigInt(350000),
        }] },
      },
      include: { lines: true },
    });
    if (p.lines.length !== 1) throw new Error(`lines=${p.lines.length}`);
    if (Number(p.totalPayable) !== 350000) throw new Error("totalPayable mismatch");
    return `id=${p.id.slice(0, 8)}`;
  });

  await check("Unique (project_id, week_key) blocks dup", async () => {
    try {
      await prisma.weeklyPayroll.create({
        data: {
          projectId: project.id, weekKey: SMOKE_WEEK_KEY,
          weekStart: wkStart, weekEnd: wkEnd, status: "draft",
          totalDays: new Prisma.Decimal(0), totalDailyWage: BigInt(0),
          totalOutputValue: BigInt(0), weekDelta: BigInt(0),
          carryoverPrev: BigInt(0), carryoverNew: BigInt(0),
          bonusPool: BigInt(0), shareRate: new Prisma.Decimal(0.5),
          totalBonus: BigInt(0), totalPayable: BigInt(0), negStreak: 0,
          closedById: admin.id,
        },
      });
      throw new Error("should have failed");
    } catch (e) {
      if (!String(e.message).match(/unique|P2002/i)) throw e;
      return "blocked";
    }
  });

  await check("Create adjustment + apply to payroll", async () => {
    const adj = await prisma.weeklyPayrollAdjustment.create({
      data: {
        projectId: project.id, workerId: worker.id,
        amount: BigInt(-50000), reason: "[smoke-m6] test adj",
        createdById: admin.id,
      },
    });
    if (adj.appliedPayrollId !== null) throw new Error("expected null applied");
    const payroll = await prisma.weeklyPayroll.findUnique({
      where: { projectId_weekKey: { projectId: project.id, weekKey: SMOKE_WEEK_KEY } },
      select: { id: true },
    });
    await prisma.weeklyPayrollAdjustment.update({
      where: { id: adj.id },
      data: { appliedPayrollId: payroll.id },
    });
    return `adj=${adj.id.slice(0, 8)}`;
  });

  await check("SET NULL on payroll delete (adjustment.appliedPayrollId)", async () => {
    const payroll = await prisma.weeklyPayroll.findUnique({
      where: { projectId_weekKey: { projectId: project.id, weekKey: SMOKE_WEEK_KEY } },
      select: { id: true },
    });
    await prisma.weeklyPayroll.delete({ where: { id: payroll.id } });
    const adj = await prisma.weeklyPayrollAdjustment.findFirst({
      where: { projectId: project.id, reason: "[smoke-m6] test adj" },
      select: { appliedPayrollId: true },
    });
    if (!adj) throw new Error("adjustment vanished");
    if (adj.appliedPayrollId !== null) throw new Error(`appliedPayrollId=${adj.appliedPayrollId}`);
    return "nulled";
  });

  await check("CASCADE: lines deleted with payroll", async () => {
    const stragglers = await prisma.$queryRaw`
      SELECT COUNT(*)::int n FROM weekly_payroll_lines wpl
      LEFT JOIN weekly_payrolls wp ON wp.id = wpl.payroll_id
      WHERE wp.id IS NULL
    `;
    if (stragglers[0].n !== 0) throw new Error(`orphans=${stragglers[0].n}`);
    return "ok";
  });

  // cleanup
  await prisma.weeklyPayrollAdjustment.deleteMany({
    where: { projectId: project.id, reason: "[smoke-m6] test adj" },
  });

  await prisma.$disconnect();
  const fs = await import("node:fs");
  fs.mkdirSync("output/reports", { recursive: true });
  fs.writeFileSync("output/reports/smoke-m6-weekly-payroll.json", JSON.stringify({ generatedAt: new Date().toISOString(), failed, results }, null, 2));
  console.log("Report: output/reports/smoke-m6-weekly-payroll.json");
  if (failed) process.exit(1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
