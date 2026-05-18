import { NextResponse } from "next/server";
import { PaymentStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildDiff, fmtDate, fmtMoney, joinSummary, logProjectActivity } from "@/lib/project-activity-log";

const patchSchema = z.object({
  status: z.nativeEnum(PaymentStatus),
  actualPaidDate: z.string().nullable().optional(),
  actualPaidAmount: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  expectedDate: z.string().nullable().optional(),
});

function normalizeDate(raw: string | null | undefined) {
  if (!raw) return null;
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

export async function PATCH(request: Request, { params }: { params: { id: string; paymentId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const row = await prisma.paymentSchedule.findFirst({
    where: {
      id: params.paymentId,
      projectId: params.id,
    },
    select: {
      id: true,
      amount: true,
      installmentNo: true,
      description: true,
      status: true,
      expectedDate: true,
      actualPaidDate: true,
      actualPaidAmount: true,
      notes: true,
      project: { select: { startDate: true } },
    },
  });

  if (!row) {
    return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { status, actualPaidDate, actualPaidAmount, notes, expectedDate } = parsed.data;

  if (status === PaymentStatus.collected) {
    if (!actualPaidDate || actualPaidAmount == null || Number(actualPaidAmount) <= 0) {
      return NextResponse.json({ message: "Khi đã thu tiền, ngày thu và số tiền thu là bắt buộc" }, { status: 400 });
    }
  }

  const updateData: {
    status: PaymentStatus;
    actualPaidDate: Date | null;
    actualPaidAmount: number | null;
    notes: string | null;
    expectedDate?: Date | null;
    dueDate?: Date | null;
    dayOffset?: number | null;
  } = {
    status,
    actualPaidDate: status === PaymentStatus.collected ? normalizeDate(actualPaidDate) : null,
    actualPaidAmount: status === PaymentStatus.collected ? actualPaidAmount ?? null : null,
    notes: notes || null,
  };

  if (expectedDate !== undefined) {
    const parsedExpected = normalizeDate(expectedDate);
    updateData.expectedDate = parsedExpected;
    updateData.dueDate = parsedExpected;
    if (parsedExpected && row.project?.startDate) {
      const ms = parsedExpected.getTime() - new Date(row.project.startDate).getTime();
      updateData.dayOffset = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
    } else {
      updateData.dayOffset = null;
    }
  }

  const updated = await prisma.paymentSchedule.update({
    where: { id: row.id },
    data: updateData,
    select: {
      id: true,
      phaseNumber: true,
      milestoneDescription: true,
      percent: true,
      amount: true,
      expectedDate: true,
      actualPaidDate: true,
      actualPaidAmount: true,
      status: true,
      notes: true,
    },
  });

  const { diff, lines } = buildDiff(
    {
      status: row.status,
      expectedDate: row.expectedDate,
      actualPaidDate: row.actualPaidDate,
      actualPaidAmount: row.actualPaidAmount ? Number(row.actualPaidAmount) : null,
      notes: row.notes ?? null,
    },
    {
      status: updated.status,
      expectedDate: updated.expectedDate,
      actualPaidDate: updated.actualPaidDate,
      actualPaidAmount: updated.actualPaidAmount ? Number(updated.actualPaidAmount) : null,
      notes: updated.notes ?? null,
    },
    [
      { key: "status", label: "Trạng thái" },
      { key: "expectedDate", label: "Hạn", format: fmtDate },
      { key: "actualPaidDate", label: "Ngày thu", format: fmtDate },
      { key: "actualPaidAmount", label: "Số tiền thu", format: fmtMoney },
      { key: "notes", label: "Ghi chú" },
    ],
  );

  if (Object.keys(diff).length > 0) {
    await logProjectActivity(prisma, {
      projectId: params.id,
      actorId: user.id,
      entity: "payment_schedule",
      entityId: updated.id,
      action: status === PaymentStatus.collected ? "mark_paid" : "update",
      summary: joinSummary(`Cập nhật đợt TT #${row.installmentNo} "${row.description}"`, lines, `Cập nhật đợt TT #${row.installmentNo}`),
      diff,
    });
  }

  return NextResponse.json({
    payment: {
      ...updated,
      percent: Number(updated.percent),
      amount: Number(updated.amount),
      actualPaidAmount: updated.actualPaidAmount ? Number(updated.actualPaidAmount) : null,
    },
    message: "Đã cập nhật thanh toán",
  });
}
