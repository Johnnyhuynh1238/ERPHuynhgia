// Smoke test cho /api/tptc/dashboard:
// Mock getCurrentUser bằng cách import trực tiếp logic + chạy với TPTC user thật.
import { BudgetCategory, ProjectStatus, UserRole, WorkOrderOutputQcStatus, WorkOrderStatus, WeeklyPayrollStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { weekKeyForDate } from "@/lib/eod";
import { addUtcDays, nowUtcDateOnly } from "@/lib/date";

function bigintToNumber(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}
function decimalToNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  const x = v as { toNumber?: () => number };
  if (typeof x.toNumber === "function") return x.toNumber();
  return Number(v);
}

async function run() {
  // Tìm 1 TPTC user
  const tptc = await prisma.user.findFirst({
    where: { id: "35f0b2f0-2302-4d61-b908-c20f01fb6574" },
    select: { id: true, email: true, fullName: true, role: true },
  });
  if (!tptc) {
    console.log("No TPTC user found");
    process.exit(0);
  }
  console.log("Using TPTC:", tptc.email);

  const user = { id: tptc.id, role: tptc.role };
  const today = nowUtcDateOnly();
  const yesterday = addUtcDays(today, -1);
  const threeDaysAgo = addUtcDays(today, -3);
  const weekKey = weekKeyForDate(today);

  const projectAccess = buildProjectAccessWhere({ id: user.id, role: user.role });

  const projects = await prisma.project.findMany({
    where: { ...projectAccess, status: { in: [ProjectStatus.planning, ProjectStatus.in_progress, ProjectStatus.paused] } },
    select: { id: true, code: true, name: true, address: true, status: true, startDate: true, expectedEndDate: true, mainEngineer: { select: { id: true, fullName: true } } },
    orderBy: { code: "asc" },
  });
  console.log("Projects accessible:", projects.length);

  if (projects.length === 0) {
    console.log("OK: empty payload (no projects)");
    process.exit(0);
  }
  const projectIds = projects.map((p) => p.id);

  const [budgets, budgetItems, workOrdersToday, workOrdersYesterdayOpen, outputsPending, outputsFailedWeek, eodTimesheetsToday, eodTimesheets3d, payrolls, woOutputsForLaborUsed, allBudgets] = await Promise.all([
    prisma.projectBudget.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, totalLabor: true, totalMaterial: true, totalEquipment: true, totalAmount: true } }),
    prisma.projectBudgetItem.groupBy({ by: ["budgetId", "category"], _sum: { amount: true }, where: { budget: { projectId: { in: projectIds } } } }),
    prisma.workOrder.findMany({ where: { projectId: { in: projectIds }, date: today }, select: { projectId: true, status: true } }),
    prisma.workOrder.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds }, date: yesterday, status: WorkOrderStatus.open }, _count: { _all: true } }),
    prisma.workOrderOutput.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds }, qcStatus: WorkOrderOutputQcStatus.pending }, _count: { _all: true } }),
    prisma.workOrderOutput.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds }, qcStatus: WorkOrderOutputQcStatus.failed, weekKey }, _count: { _all: true } }),
    prisma.workerTimesheet.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds }, date: today }, _count: { _all: true } }),
    prisma.workerTimesheet.groupBy({ by: ["projectId", "date"], where: { projectId: { in: projectIds }, date: { gte: threeDaysAgo, lte: today } }, _count: { _all: true } }),
    prisma.weeklyPayroll.findMany({ where: { projectId: { in: projectIds }, weekKey }, select: { projectId: true, status: true, totalPayable: true, bonusPool: true, negStreak: true } }),
    prisma.workOrderOutput.findMany({ where: { projectId: { in: projectIds }, approvedQty: { not: null } }, select: { projectId: true, approvedQty: true, workOrder: { select: { unitPrice: true, budgetItem: { select: { category: true } } } } } }),
    prisma.projectBudget.findMany({ where: { projectId: { in: projectIds } }, select: { id: true, projectId: true } }),
  ]);
  console.log("Budgets:", budgets.length, "Items rows:", budgetItems.length, "WO today:", workOrdersToday.length, "Outputs approved:", woOutputsForLaborUsed.length, "Payrolls week:", payrolls.length);

  const budgetIdToProject = new Map<string, string>();
  allBudgets.forEach((b) => budgetIdToProject.set(b.id, b.projectId));

  const plannedByCat = new Map<string, { labor: number; material: number; equipment: number }>();
  for (const row of budgetItems) {
    const projectId = budgetIdToProject.get(row.budgetId);
    if (!projectId) continue;
    const agg = plannedByCat.get(projectId) ?? { labor: 0, material: 0, equipment: 0 };
    const amount = bigintToNumber(row._sum.amount as unknown as bigint);
    if (row.category === BudgetCategory.labor) agg.labor += amount;
    else if (row.category === BudgetCategory.material) agg.material += amount;
    else if (row.category === BudgetCategory.equipment) agg.equipment += amount;
    plannedByCat.set(projectId, agg);
  }
  const usedByCat = new Map<string, { labor: number; material: number; equipment: number }>();
  for (const row of woOutputsForLaborUsed) {
    const cat = row.workOrder.budgetItem.category;
    const qty = decimalToNumber(row.approvedQty);
    const unitPrice = bigintToNumber(row.workOrder.unitPrice);
    const value = qty * unitPrice;
    const agg = usedByCat.get(row.projectId) ?? { labor: 0, material: 0, equipment: 0 };
    if (cat === BudgetCategory.labor) agg.labor += value;
    else if (cat === BudgetCategory.material) agg.material += value;
    else if (cat === BudgetCategory.equipment) agg.equipment += value;
    usedByCat.set(row.projectId, agg);
  }

  for (const p of projects) {
    const planned = plannedByCat.get(p.id) ?? { labor: 0, material: 0, equipment: 0 };
    const used = usedByCat.get(p.id) ?? { labor: 0, material: 0, equipment: 0 };
    const todayWo = workOrdersToday.filter((w) => w.projectId === p.id);
    const py = payrolls.find((x) => x.projectId === p.id);
    console.log(`- ${p.code} ${p.name}: NC planned=${planned.labor} used=${used.labor} WO_today=${todayWo.length} payroll=${py?.status ?? "missing"}`);
  }

  // Silence eod var warnings
  void workOrdersYesterdayOpen; void outputsPending; void outputsFailedWeek; void eodTimesheetsToday; void eodTimesheets3d; void budgets;
  console.log("OK: queries all ran without errors");
  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error("SMOKE FAIL:", e);
  await prisma.$disconnect();
  process.exit(1);
});
