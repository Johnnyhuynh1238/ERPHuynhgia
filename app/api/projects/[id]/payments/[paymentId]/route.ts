import { NextResponse } from "next/server";
import { PaymentStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

const patchSchema = z.object({
  status: z.nativeEnum(PaymentStatus),
  actualPaidDate: z.string().nullable().optional(),
  actualPaidAmount: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
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

  const { status, actualPaidDate, actualPaidAmount, notes } = parsed.data;

  if (status === PaymentStatus.collected) {
    if (!actualPaidDate || actualPaidAmount == null || Number(actualPaidAmount) <= 0) {
      return NextResponse.json({ message: "Khi đã thu tiền, ngày thu và số tiền thu là bắt buộc" }, { status: 400 });
    }
  }

  const updated = await prisma.paymentSchedule.update({
    where: { id: row.id },
    data: {
      status,
      actualPaidDate: status === PaymentStatus.collected ? normalizeDate(actualPaidDate) : null,
      actualPaidAmount: status === PaymentStatus.collected ? actualPaidAmount : null,
      notes: notes || null,
    },
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
