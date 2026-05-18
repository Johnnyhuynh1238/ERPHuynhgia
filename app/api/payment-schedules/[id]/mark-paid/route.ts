import { NextResponse } from "next/server";
import { PaymentStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { fmtDate, fmtMoney, logProjectActivity } from "@/lib/project-activity-log";

const markPaidSchema = z.object({
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày thu không hợp lệ"),
  paidAmount: z.coerce.number().positive("Số tiền thu phải lớn hơn 0"),
  receiptUrl: z.string().trim().min(1, "Biên lai là bắt buộc"),
  paymentNote: z.string().trim().optional(),
});

function canEdit(role: UserRole) {
  return role === UserRole.admin || role === UserRole.accountant;
}

function isPaid(status: PaymentStatus) {
  return status === PaymentStatus.collected || status === PaymentStatus.paid;
}

function atUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEdit(user.role as UserRole)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const payment = await prisma.paymentSchedule.findUnique({ where: { id: params.id } });
  if (!payment) return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  if (isPaid(payment.status)) return NextResponse.json({ message: "Đợt này đã thu" }, { status: 400 });

  const project = await prisma.project.findFirst({
    where: { id: payment.projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const parsed = markPaidSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });

  const payload = parsed.data;
  const paidAt = atUtcDate(payload.paidAt);
  const updated = await prisma.paymentSchedule.update({
    where: { id: params.id },
    data: {
      status: PaymentStatus.paid,
      paidAt,
      paidAmount: payload.paidAmount,
      receiptUrl: payload.receiptUrl,
      paymentNote: payload.paymentNote || null,
      actualPaidDate: paidAt,
      actualPaidAmount: payload.paidAmount,
      notes: payload.paymentNote || null,
    },
  });

  await logProjectActivity(prisma, {
    projectId: updated.projectId,
    actorId: user.id,
    entity: "payment_schedule",
    entityId: updated.id,
    action: "mark_paid",
    summary: `Đã thu đợt TT #${updated.installmentNo} "${updated.description}" — ${fmtMoney(payload.paidAmount)} (ngày ${fmtDate(paidAt)})`,
    metadata: { paidAmount: payload.paidAmount, paidAt: payload.paidAt, receiptUrl: payload.receiptUrl, paymentNote: payload.paymentNote ?? null },
  });

  return NextResponse.json({ payment: updated, message: "Đã đánh dấu đã thu" });
}
