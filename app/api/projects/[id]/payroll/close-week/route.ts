import { NextResponse } from "next/server";
import { Prisma, WorkOrderOutputQcStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";
import {
  SHARE_RATE,
  calcWeeklyPayroll,
  canCloseWeek,
  computeNegativeStreak,
  weekRangeFromKey,
} from "@/lib/weekly-payroll";

const bodySchema = z.object({
  weekKey: z.string().regex(/^\d{4}-W\d{2}$/, "weekKey không hợp lệ"),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canCloseWeek({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được chốt tuần" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { weekKey, note } = parsed.data;
  const { weekStart, weekEnd } = weekRangeFromKey(weekKey);

  const existing = await prisma.weeklyPayroll.findUnique({
    where: { projectId_weekKey: { projectId: project.id, weekKey } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ message: "Tuần này đã chốt rồi" }, { status: 409 });
  }

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
      select: { id: true, workerId: true, amount: true, reason: true },
    }),
  ]);

  if (timesheets.length === 0 && outputs.length === 0 && pendingAdjustments.length === 0) {
    return NextResponse.json({ message: "Tuần này chưa có chấm công / sản lượng / điều chỉnh" }, { status: 400 });
  }

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

  const totalAbsentMua = calc.lines.reduce((s, l) => s + l.absentDaysMua, 0);
  const totalAbsentCho = calc.lines.reduce((s, l) => s + l.absentDaysCho, 0);
  const negStreak = computeNegativeStreak(
    prevPayroll?.negStreak ?? 0,
    calc.weekDelta,
    totalAbsentMua,
    totalAbsentCho,
  );

  const workerById = new Map(workersAll.map((w) => [w.id, w]));

  const created = await prisma.$transaction(async (tx) => {
    const payroll = await tx.weeklyPayroll.create({
      data: {
        projectId: project.id,
        weekKey,
        weekStart,
        weekEnd,
        status: "draft",
        totalDays: new Prisma.Decimal(calc.totalDays),
        totalDailyWage: BigInt(calc.totalDailyWage),
        totalOutputValue: BigInt(calc.totalOutputValue),
        weekDelta: BigInt(calc.weekDelta),
        carryoverPrev: BigInt(calc.carryoverPrev),
        carryoverNew: BigInt(calc.carryoverNew),
        bonusPool: BigInt(calc.bonusPool),
        shareRate: new Prisma.Decimal(calc.shareRate),
        totalBonus: BigInt(calc.totalBonus),
        totalPayable: BigInt(calc.totalPayable),
        negStreak,
        note: note ?? null,
        closedById: user.id,
      },
      select: { id: true },
    });

    if (calc.lines.length > 0) {
      await tx.weeklyPayrollLine.createMany({
        data: calc.lines.map((l) => {
          const w = workerById.get(l.workerId);
          return {
            payrollId: payroll.id,
            workerId: l.workerId,
            fullName: w?.fullName ?? "(không rõ)",
            grade: w?.grade ?? null,
            bankAccount: w?.bankAccount ?? null,
            bankName: w?.bankName ?? null,
            phone: w?.phone ?? null,
            totalDays: new Prisma.Decimal(l.totalDays),
            dailyRate: BigInt(l.dailyRate),
            dailyWage: BigInt(l.dailyWage),
            bonus: BigInt(l.bonus),
            adjustment: BigInt(l.adjustment),
            payable: BigInt(l.payable),
            absentDaysP: l.absentDaysP,
            absentDaysKp: l.absentDaysKp,
            absentDaysMua: l.absentDaysMua,
            absentDaysCho: l.absentDaysCho,
          };
        }),
      });
    }

    if (pendingAdjustments.length > 0) {
      await tx.weeklyPayrollAdjustment.updateMany({
        where: { id: { in: pendingAdjustments.map((a) => a.id) } },
        data: { appliedPayrollId: payroll.id },
      });
    }

    await logProjectActivity(tx, {
      projectId: project.id,
      actorId: user.id,
      entity: "weekly_payroll",
      entityId: payroll.id,
      action: "create",
      summary: `Chốt tuần ${weekKey}: ${calc.lines.length} thợ, chênh ${calc.weekDelta.toLocaleString("vi-VN")}đ, chi ${calc.totalPayable.toLocaleString("vi-VN")}đ`,
      metadata: {
        weekKey,
        totalPayable: calc.totalPayable,
        weekDelta: calc.weekDelta,
        carryoverNew: calc.carryoverNew,
        negStreak,
        lineCount: calc.lines.length,
        appliedAdjustments: pendingAdjustments.length,
      },
    });

    return payroll;
  });

  return NextResponse.json({ ok: true, payrollId: created.id, weekKey, shareRate: SHARE_RATE });
}
