import { NextResponse } from "next/server";
import { BudgetCategory, MaterialProposalStatus, ProjectStatus, TimesheetAbsentReason, UserRole, WeeklyPayrollStatus, WorkOrderOutputQcStatus, WorkOrderStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { weekKeyForDate } from "@/lib/eod";
import { addUtcDays, nowUtcDateOnly } from "@/lib/date";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CategoryAgg = {
  planned: number;
  used: number;
};

type ProjectMetrics = {
  id: string;
  code: string;
  name: string;
  address: string;
  status: ProjectStatus;
  startDate: string;
  expectedEndDate: string;
  mainEngineer: { id: string; name: string } | null;

  budget: {
    labor: CategoryAgg;
    material: CategoryAgg;
    equipment: CategoryAgg;
    total: { planned: number; used: number };
  };

  workOrders: {
    todayTotal: number;
    todayOpen: number;
    todayDone: number;
    carried: number;
    stuckDays: number; // số ngày liên tiếp WO có "open" (proxy: nếu hôm qua cũng có open >=1)
  };

  eod: {
    submittedToday: boolean;
    missingDays: number; // số ngày trong 3 ngày gần nhất không có timesheet
  };

  qc: {
    pendingReview: number; // outputs qcStatus=pending
    failedThisWeek: number; // outputs qcStatus=failed in current week
  };

  attendance: {
    present: number; // dayValue 1 hoặc 0.5
    absentP: number;
    absentKP: number;
    absentMUA: number;
    absentCHO: number;
    total: number;
  };

  materialProposals: {
    pendingToday: number; // đề xuất hôm nay chưa duyệt
  };

  payroll: {
    weekKey: string;
    status: WeeklyPayrollStatus | "missing";
    totalPayable: number;
    bonusPool: number;
    negStreak: number;
  };

  alerts: string[];
};

type DashboardPayload = {
  role: "construction_manager" | "admin";
  today: string;
  weekKey: string;
  totals: {
    projectsCount: number;
    laborUsedPct: number;
    materialUsedPct: number;
    qcPending: number;
    eodMissingToday: number;
    woCarried: number;
    payrollDraft: number;
  };
  projects: ProjectMetrics[];
  alerts: Array<{ projectId: string; projectCode: string; message: string; severity: "warn" | "danger" }>;
};

function bigintToNumber(value: bigint | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value);
}

function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  // Prisma Decimal has toNumber()
  const v = value as { toNumber?: () => number };
  if (typeof v.toNumber === "function") return v.toNumber();
  return Number(value);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.construction_manager && user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ TPTC mới truy cập được dashboard này" }, { status: 403 });
  }

  const today = nowUtcDateOnly();
  const yesterday = addUtcDays(today, -1);
  const threeDaysAgo = addUtcDays(today, -3);
  const weekKey = weekKeyForDate(today);

  const projectAccess = buildProjectAccessWhere({ id: user.id, role: user.role });

  const projects = await prisma.project.findMany({
    where: {
      ...projectAccess,
      status: { in: [ProjectStatus.planning, ProjectStatus.in_progress, ProjectStatus.paused] },
    },
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      status: true,
      startDate: true,
      expectedEndDate: true,
      mainEngineer: { select: { id: true, fullName: true } },
    },
    orderBy: { code: "asc" },
  });

  const projectIds = projects.map((p) => p.id);

  if (projectIds.length === 0) {
    const empty: DashboardPayload = {
      role: user.role as "construction_manager" | "admin",
      today: today.toISOString().slice(0, 10),
      weekKey,
      totals: { projectsCount: 0, laborUsedPct: 0, materialUsedPct: 0, qcPending: 0, eodMissingToday: 0, woCarried: 0, payrollDraft: 0 },
      projects: [],
      alerts: [],
    };
    return NextResponse.json(empty);
  }

  const [budgets, budgetItems, workOrdersToday, workOrdersCarried, workOrdersYesterdayOpen, outputsPending, outputsFailedWeek, eodTimesheetsToday, eodTimesheets3d, payrolls, woOutputsForLaborUsed, attendanceTodayRows, materialProposalsPending] = await Promise.all([
    prisma.projectBudget.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, totalLabor: true, totalMaterial: true, totalEquipment: true, totalAmount: true },
    }),
    prisma.projectBudgetItem.groupBy({
      by: ["budgetId", "category"],
      _sum: { amount: true },
      where: { budget: { projectId: { in: projectIds } } },
    }),
    prisma.workOrder.findMany({
      where: { projectId: { in: projectIds }, date: today },
      select: { projectId: true, status: true },
    }),
    prisma.workOrder.count({
      where: { projectId: { in: projectIds }, status: WorkOrderStatus.carried },
    }),
    prisma.workOrder.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, date: yesterday, status: WorkOrderStatus.open },
      _count: { _all: true },
    }),
    prisma.workOrderOutput.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, qcStatus: WorkOrderOutputQcStatus.pending },
      _count: { _all: true },
    }),
    prisma.workOrderOutput.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, qcStatus: WorkOrderOutputQcStatus.failed, weekKey },
      _count: { _all: true },
    }),
    prisma.workerTimesheet.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, date: today },
      _count: { _all: true },
    }),
    prisma.workerTimesheet.groupBy({
      by: ["projectId", "date"],
      where: { projectId: { in: projectIds }, date: { gte: threeDaysAgo, lte: today } },
      _count: { _all: true },
    }),
    prisma.weeklyPayroll.findMany({
      where: { projectId: { in: projectIds }, weekKey },
      select: { projectId: true, status: true, totalPayable: true, bonusPool: true, negStreak: true },
    }),
    // For NC used: sum approvedQty * WO.unitPrice grouped by project & budget category
    prisma.workOrderOutput.findMany({
      where: { projectId: { in: projectIds }, approvedQty: { not: null } },
      select: {
        projectId: true,
        approvedQty: true,
        workOrder: {
          select: {
            unitPrice: true,
            budgetItem: { select: { category: true } },
          },
        },
      },
    }),
    // Chấm công thợ hôm nay: phân loại theo dayValue + absentReason
    prisma.workerTimesheet.findMany({
      where: { projectId: { in: projectIds }, date: today },
      select: { projectId: true, dayValue: true, absentReason: true },
    }),
    // Đề xuất vật tư hôm nay chưa duyệt
    prisma.materialProposal.groupBy({
      by: ["projectId"],
      where: {
        projectId: { in: projectIds },
        status: MaterialProposalStatus.pending,
        createdAt: { gte: today, lte: new Date(today.getTime() + 24 * 3600 * 1000 - 1) },
      },
      _count: { _all: true },
    }),
  ]);

  const budgetMap = new Map(budgets.map((b) => [b.projectId, b]));
  const budgetIdToProject = new Map<string, string>();
  // Map budgetId → projectId
  const allBudgetItems = await prisma.projectBudget.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, projectId: true },
  });
  allBudgetItems.forEach((b) => budgetIdToProject.set(b.id, b.projectId));

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

  const woTodayByProject = new Map<string, { open: number; done: number; total: number }>();
  for (const wo of workOrdersToday) {
    const agg = woTodayByProject.get(wo.projectId) ?? { open: 0, done: 0, total: 0 };
    agg.total += 1;
    if (wo.status === WorkOrderStatus.done) agg.done += 1;
    else if (wo.status === WorkOrderStatus.open) agg.open += 1;
    woTodayByProject.set(wo.projectId, agg);
  }

  const carriedByProject = await prisma.workOrder.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds }, status: WorkOrderStatus.carried },
    _count: { _all: true },
  });
  const carriedMap = new Map(carriedByProject.map((c) => [c.projectId, c._count._all]));

  const yesterdayOpenSet = new Set(workOrdersYesterdayOpen.map((r) => r.projectId));

  const qcPendingMap = new Map(outputsPending.map((r) => [r.projectId, r._count._all]));
  const qcFailedWeekMap = new Map(outputsFailedWeek.map((r) => [r.projectId, r._count._all]));

  const eodTodayMap = new Map(eodTimesheetsToday.map((r) => [r.projectId, r._count._all]));
  const eodDaysByProject = new Map<string, Set<string>>();
  for (const row of eodTimesheets3d) {
    const set = eodDaysByProject.get(row.projectId) ?? new Set<string>();
    set.add(row.date.toISOString().slice(0, 10));
    eodDaysByProject.set(row.projectId, set);
  }

  const payrollMap = new Map(payrolls.map((p) => [p.projectId, p]));

  const attendanceMap = new Map<string, ProjectMetrics["attendance"]>();
  for (const t of attendanceTodayRows) {
    const agg = attendanceMap.get(t.projectId) ?? { present: 0, absentP: 0, absentKP: 0, absentMUA: 0, absentCHO: 0, total: 0 };
    const dv = decimalToNumber(t.dayValue);
    agg.total += 1;
    if (dv > 0) {
      agg.present += 1;
    } else if (t.absentReason === TimesheetAbsentReason.P) agg.absentP += 1;
    else if (t.absentReason === TimesheetAbsentReason.KP) agg.absentKP += 1;
    else if (t.absentReason === TimesheetAbsentReason.MUA) agg.absentMUA += 1;
    else if (t.absentReason === TimesheetAbsentReason.CHO) agg.absentCHO += 1;
    attendanceMap.set(t.projectId, agg);
  }

  const materialProposalsMap = new Map(materialProposalsPending.map((r) => [r.projectId, r._count._all]));

  const projectMetrics: ProjectMetrics[] = projects.map((p) => {
    const planned = plannedByCat.get(p.id) ?? { labor: 0, material: 0, equipment: 0 };
    const used = usedByCat.get(p.id) ?? { labor: 0, material: 0, equipment: 0 };
    const totalPlanned = planned.labor + planned.material + planned.equipment;
    const totalUsed = used.labor + used.material + used.equipment;

    const todayWo = woTodayByProject.get(p.id) ?? { open: 0, done: 0, total: 0 };
    const carried = carriedMap.get(p.id) ?? 0;
    const stuckDays = yesterdayOpenSet.has(p.id) && todayWo.open > 0 ? 2 : todayWo.open > 0 ? 1 : 0;

    const submittedToday = (eodTodayMap.get(p.id) ?? 0) > 0;
    const daysWithEod = eodDaysByProject.get(p.id)?.size ?? 0;
    const missingDays = Math.max(0, 4 - daysWithEod);

    const payroll = payrollMap.get(p.id);

    const laborPct = planned.labor > 0 ? Math.round((used.labor / planned.labor) * 100) : 0;
    const materialPct = planned.material > 0 ? Math.round((used.material / planned.material) * 100) : 0;
    const equipPct = planned.equipment > 0 ? Math.round((used.equipment / planned.equipment) * 100) : 0;

    const alerts: string[] = [];
    if (laborPct >= 90) alerts.push(`Nhân công đã dùng ${laborPct}% dự toán`);
    if (materialPct >= 90) alerts.push(`Vật tư đã dùng ${materialPct}% dự toán`);
    if (equipPct >= 90) alerts.push(`Máy móc đã dùng ${equipPct}% dự toán`);
    if (stuckDays >= 2) alerts.push(`Phiếu giao việc tắc ${stuckDays} ngày liên tiếp`);
    if (!submittedToday) alerts.push("Kỹ sư chưa nộp báo cáo cuối ngày");
    if ((qcPendingMap.get(p.id) ?? 0) >= 5) alerts.push(`${qcPendingMap.get(p.id)} sản lượng chờ TPTC nghiệm thu`);
    if ((qcFailedWeekMap.get(p.id) ?? 0) >= 3) alerts.push(`${qcFailedWeekMap.get(p.id)} sản lượng QC fail tuần này`);
    if (payroll && payroll.negStreak >= 2) alerts.push(`Lương tuần âm ${payroll.negStreak} tuần liên tiếp`);

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      address: p.address,
      status: p.status,
      startDate: p.startDate.toISOString().slice(0, 10),
      expectedEndDate: p.expectedEndDate.toISOString().slice(0, 10),
      mainEngineer: p.mainEngineer ? { id: p.mainEngineer.id, name: p.mainEngineer.fullName ?? "" } : null,
      budget: {
        labor: { planned: planned.labor, used: used.labor },
        material: { planned: planned.material, used: used.material },
        equipment: { planned: planned.equipment, used: used.equipment },
        total: { planned: totalPlanned, used: totalUsed },
      },
      workOrders: {
        todayTotal: todayWo.total,
        todayOpen: todayWo.open,
        todayDone: todayWo.done,
        carried,
        stuckDays,
      },
      eod: {
        submittedToday,
        missingDays,
      },
      qc: {
        pendingReview: qcPendingMap.get(p.id) ?? 0,
        failedThisWeek: qcFailedWeekMap.get(p.id) ?? 0,
      },
      attendance: attendanceMap.get(p.id) ?? { present: 0, absentP: 0, absentKP: 0, absentMUA: 0, absentCHO: 0, total: 0 },
      materialProposals: { pendingToday: materialProposalsMap.get(p.id) ?? 0 },
      payroll: {
        weekKey,
        status: payroll?.status ?? "missing",
        totalPayable: bigintToNumber(payroll?.totalPayable as bigint | undefined),
        bonusPool: bigintToNumber(payroll?.bonusPool as bigint | undefined),
        negStreak: payroll?.negStreak ?? 0,
      },
      alerts,
    };
  });

  // Cross-project totals
  let laborPlannedSum = 0;
  let laborUsedSum = 0;
  let materialPlannedSum = 0;
  let materialUsedSum = 0;
  let qcPendingSum = 0;
  let eodMissingTodaySum = 0;
  let woCarriedSum = 0;
  let payrollDraftSum = 0;
  for (const m of projectMetrics) {
    laborPlannedSum += m.budget.labor.planned;
    laborUsedSum += m.budget.labor.used;
    materialPlannedSum += m.budget.material.planned;
    materialUsedSum += m.budget.material.used;
    qcPendingSum += m.qc.pendingReview;
    if (!m.eod.submittedToday) eodMissingTodaySum += 1;
    woCarriedSum += m.workOrders.carried;
    if (m.payroll.status === WeeklyPayrollStatus.draft) payrollDraftSum += 1;
  }

  const crossAlerts: DashboardPayload["alerts"] = [];
  for (const m of projectMetrics) {
    for (const msg of m.alerts) {
      crossAlerts.push({
        projectId: m.id,
        projectCode: m.code,
        message: msg,
        severity: msg.includes("90%") || msg.includes("tắc") ? "danger" : "warn",
      });
    }
  }

  const payload: DashboardPayload = {
    role: user.role as "construction_manager" | "admin",
    today: today.toISOString().slice(0, 10),
    weekKey,
    totals: {
      projectsCount: projectMetrics.length,
      laborUsedPct: laborPlannedSum > 0 ? Math.round((laborUsedSum / laborPlannedSum) * 100) : 0,
      materialUsedPct: materialPlannedSum > 0 ? Math.round((materialUsedSum / materialPlannedSum) * 100) : 0,
      qcPending: qcPendingSum,
      eodMissingToday: eodMissingTodaySum,
      woCarried: woCarriedSum,
      payrollDraft: payrollDraftSum,
    },
    projects: projectMetrics,
    alerts: crossAlerts,
  };

  return NextResponse.json(payload);
}
