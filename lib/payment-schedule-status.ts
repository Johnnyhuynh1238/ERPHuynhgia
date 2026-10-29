import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Ngày hạn đợt thu = expected_date, trống thì due_date (SOP-11 luật 6 / GĐ-9).
function dueBefore(today: Date): Prisma.PaymentScheduleWhereInput {
  return { OR: [{ expectedDate: { lt: today } }, { expectedDate: null, dueDate: { lt: today } }] };
}

function dueFrom(today: Date): Prisma.PaymentScheduleWhereInput {
  return { OR: [{ expectedDate: { gte: today } }, { expectedDate: null, dueDate: { gte: today } }] };
}

export function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
}

/**
 * Đồng bộ trạng thái trễ hạn theo ngày hạn của dự án:
 * - quá hạn: not_collected → customer_late, pending → overdue
 * - dời hạn ra sau (hạn ≥ hôm nay): customer_late → not_collected, overdue → pending (SOP-11 S7)
 */
export async function syncPaymentLateStatus(projectId: string) {
  const today = startOfTodayUtc();
  await prisma.$transaction([
    prisma.paymentSchedule.updateMany({
      where: { projectId, status: PaymentStatus.customer_late, ...dueFrom(today) },
      data: { status: PaymentStatus.not_collected },
    }),
    prisma.paymentSchedule.updateMany({
      where: { projectId, status: PaymentStatus.overdue, ...dueFrom(today) },
      data: { status: PaymentStatus.pending },
    }),
    prisma.paymentSchedule.updateMany({
      where: { projectId, status: PaymentStatus.not_collected, ...dueBefore(today) },
      data: { status: PaymentStatus.customer_late },
    }),
    prisma.paymentSchedule.updateMany({
      where: { projectId, status: PaymentStatus.pending, ...dueBefore(today) },
      data: { status: PaymentStatus.overdue },
    }),
  ]);
}
