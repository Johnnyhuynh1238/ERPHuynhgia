import { NextResponse } from "next/server";
import { WorkOrderOutputQcStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import {
  PAYROLL_STATUS_LABEL,
  SHARE_RATE,
  calcWeeklyPayroll,
  canViewPayroll,
  weekKeyForDateStr,
  weekRangeFromKey,
} from "@/lib/weekly-payroll";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewPayroll({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const url = new URL(request.url);
  const requestedWeek = url.searchParams.get("week");
  let weekKey = requestedWeek;
  if (!weekKey) {
    // Mặc định = tuần hiện tại
    const today = new Date();
    weekKey = weekKeyForDateStr(today.toISOString().slice(0, 10));
  }
  if (!/^\d{4}-W\d{2}$/.test(weekKey)) {
    return NextResponse.json({ message: "weekKey không hợp lệ" }, { status: 400 });
  }

  const { weekStart, weekEnd } = weekRangeFromKey(weekKey);

  // Danh sách bảng lương đã chốt — list compact cho week picker
  const closedList = await prisma.weeklyPayroll.findMany({
    where: { projectId: project.id },
    orderBy: { weekStart: "desc" },
    select: {
      id: true, weekKey: true, weekStart: true, weekEnd: true,
      status: true, totalPayable: true, weekDelta: true, negStreak: true,
    },
    take: 20,
  });

  const existing = await prisma.weeklyPayroll.findUnique({
    where: { projectId_weekKey: { projectId: project.id, weekKey } },
    include: {
      lines: { orderBy: { fullName: "asc" } },
      adjustments: { include: { worker: { select: { fullName: true } } } },
      closedBy:  { select: { id: true, fullName: true } },
      readiedBy: { select: { id: true, fullName: true } },
      paidBy:    { select: { id: true, fullName: true } },
    },
  });

  if (existing) {
    return NextResponse.json({
      project,
      weekKey, weekStart, weekEnd,
      shareRate: Number(existing.shareRate),
      closedList: closedList.map(serializeListItem),
      payroll: serializePayroll(existing),
      preview: null,
    });
  }

  // Preview live = tính từ timesheets/outputs hiện có, KHÔNG persist
  const [timesheets, outputs, workersAll, prevPayroll, pendingAdjustments] = await Promise.all([
    prisma.workerTimesheet.findMany({
      where: { projectId: project.id, weekKey },
      select: { workerId: true, dayValue: true, absentReason: true },
    }),
    prisma.workOrderOutput.findMany({
      where: { projectId: project.id, weekKey, qcStatus: WorkOrderOutputQcStatus.passed },
      select: { workOrderId: true, approvedQty: true, workOrder: { select: { unitPrice: true } } },
    }),
    prisma.worker.findMany({
      where: { projectId: project.id },
      select: {
        id: true, fullName: true, grade: true, dailyRate: true,
        bankAccount: true, bankName: true, phone: true,
      },
    }),
    prisma.weeklyPayroll.findFirst({
      where: { projectId: project.id, weekEnd: { lt: weekStart } },
      orderBy: { weekEnd: "desc" },
      select: { carryoverNew: true, negStreak: true },
    }),
    prisma.weeklyPayrollAdjustment.findMany({
      where: { projectId: project.id, appliedPayrollId: null },
      select: { workerId: true, amount: true, reason: true, id: true },
    }),
  ]);

  const calc = calcWeeklyPayroll({
    workers: workersAll.map((w) => ({
      id: w.id, fullName: w.fullName, grade: w.grade,
      dailyRate: w.dailyRate ?? 0,
      bankAccount: w.bankAccount, bankName: w.bankName, phone: w.phone,
    })),
    timesheets: timesheets.map((t) => ({
      workerId: t.workerId, dayValue: Number(t.dayValue), absentReason: t.absentReason,
    })),
    outputs: outputs.map((o) => ({
      workOrderId: o.workOrderId,
      approvedQty: o.approvedQty == null ? 0 : Number(o.approvedQty),
      unitPrice: Number(o.workOrder.unitPrice),
    })),
    adjustments: pendingAdjustments.map((a) => ({ workerId: a.workerId, amount: Number(a.amount) })),
    prevCarryover: prevPayroll ? Number(prevPayroll.carryoverNew) : 0,
  });

  const workerById = new Map(workersAll.map((w) => [w.id, w]));

  return NextResponse.json({
    project,
    weekKey, weekStart, weekEnd,
    shareRate: SHARE_RATE,
    closedList: closedList.map(serializeListItem),
    payroll: null,
    preview: {
      ...calc,
      lines: calc.lines.map((l) => {
        const w = workerById.get(l.workerId);
        return {
          ...l,
          fullName: w?.fullName ?? "(không rõ)",
          grade: w?.grade ?? null,
          bankAccount: w?.bankAccount ?? null,
          bankName: w?.bankName ?? null,
          phone: w?.phone ?? null,
        };
      }),
      pendingAdjustmentsCount: pendingAdjustments.length,
      pendingAdjustments: pendingAdjustments.map((a) => ({
        id: a.id, workerId: a.workerId, amount: Number(a.amount), reason: a.reason,
      })),
      prevPayroll: prevPayroll ? {
        carryoverNew: Number(prevPayroll.carryoverNew),
        negStreak: prevPayroll.negStreak,
      } : null,
    },
    statusLabels: PAYROLL_STATUS_LABEL,
  });
}

function serializeListItem(it: {
  id: string; weekKey: string; weekStart: Date; weekEnd: Date;
  status: string; totalPayable: bigint; weekDelta: bigint; negStreak: number;
}) {
  return {
    id: it.id,
    weekKey: it.weekKey,
    weekStart: it.weekStart,
    weekEnd: it.weekEnd,
    status: it.status,
    totalPayable: Number(it.totalPayable),
    weekDelta: Number(it.weekDelta),
    negStreak: it.negStreak,
  };
}

function serializePayroll(p: {
  id: string; weekKey: string; weekStart: Date; weekEnd: Date; status: string;
  totalDays: { toString: () => string } | number;
  totalDailyWage: bigint; totalOutputValue: bigint; weekDelta: bigint;
  carryoverPrev: bigint; carryoverNew: bigint; bonusPool: bigint;
  shareRate: { toString: () => string } | number;
  totalBonus: bigint; totalPayable: bigint; negStreak: number;
  note: string | null; paidNote: string | null;
  closedById: string; closedAt: Date;
  readiedById: string | null; readiedAt: Date | null;
  paidById: string | null; paidAt: Date | null;
  closedBy:  { id: string; fullName: string };
  readiedBy: { id: string; fullName: string } | null;
  paidBy:    { id: string; fullName: string } | null;
  lines: Array<{
    id: string; workerId: string; fullName: string; grade: number | null;
    bankAccount: string | null; bankName: string | null; phone: string | null;
    totalDays: { toString: () => string } | number;
    dailyRate: bigint; dailyWage: bigint; bonus: bigint; adjustment: bigint; payable: bigint;
    absentDaysP: number; absentDaysKp: number; absentDaysMua: number; absentDaysCho: number;
    note: string | null;
  }>;
  adjustments: Array<{
    id: string; workerId: string; amount: bigint; reason: string; createdAt: Date;
    worker: { fullName: string };
  }>;
}) {
  return {
    id: p.id,
    weekKey: p.weekKey,
    weekStart: p.weekStart,
    weekEnd: p.weekEnd,
    status: p.status,
    totalDays: Number(p.totalDays),
    totalDailyWage: Number(p.totalDailyWage),
    totalOutputValue: Number(p.totalOutputValue),
    weekDelta: Number(p.weekDelta),
    carryoverPrev: Number(p.carryoverPrev),
    carryoverNew: Number(p.carryoverNew),
    bonusPool: Number(p.bonusPool),
    shareRate: Number(p.shareRate),
    totalBonus: Number(p.totalBonus),
    totalPayable: Number(p.totalPayable),
    negStreak: p.negStreak,
    note: p.note,
    paidNote: p.paidNote,
    closedBy:  p.closedBy,
    closedAt:  p.closedAt,
    readiedBy: p.readiedBy,
    readiedAt: p.readiedAt,
    paidBy:    p.paidBy,
    paidAt:    p.paidAt,
    lines: p.lines.map((l) => ({
      id: l.id,
      workerId: l.workerId,
      fullName: l.fullName,
      grade: l.grade,
      bankAccount: l.bankAccount,
      bankName: l.bankName,
      phone: l.phone,
      totalDays: Number(l.totalDays),
      dailyRate: Number(l.dailyRate),
      dailyWage: Number(l.dailyWage),
      bonus: Number(l.bonus),
      adjustment: Number(l.adjustment),
      payable: Number(l.payable),
      absentDaysP: l.absentDaysP,
      absentDaysKp: l.absentDaysKp,
      absentDaysMua: l.absentDaysMua,
      absentDaysCho: l.absentDaysCho,
      note: l.note,
    })),
    adjustments: p.adjustments.map((a) => ({
      id: a.id,
      workerId: a.workerId,
      workerName: a.worker.fullName,
      amount: Number(a.amount),
      reason: a.reason,
      createdAt: a.createdAt,
    })),
  };
}
