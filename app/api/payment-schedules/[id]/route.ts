import { NextResponse } from "next/server";
import { PaymentStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { buildDiff, fmtDate, fmtMoney, joinSummary, logProjectActivity } from "@/lib/project-activity-log";

const updatePaymentSchema = z.object({
  type: z.enum(["contract", "addendum"]).optional(),
  installmentNo: z.coerce.number().int().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  amount: z.coerce.number().positive().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

async function requirePaymentEditAccess(id: string) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return { error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }) };
  if (!canEdit(user.role as UserRole)) return { error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }) };

  const payment = await prisma.paymentSchedule.findUnique({ where: { id }, select: { id: true, projectId: true, status: true } });
  if (!payment) return { error: NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 }) };

  const project = await prisma.project.findFirst({
    where: { id: payment.projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, contractValue: true },
  });
  if (!project) return { error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }) };

  return { user, payment, project };
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const access = await requirePaymentEditAccess(params.id);
  if (access.error) return access.error;
  if (isPaid(access.payment.status)) return NextResponse.json({ message: "Đợt đã thu không được sửa" }, { status: 400 });

  const parsed = updatePaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });

  const before = await prisma.paymentSchedule.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });

  const payload = parsed.data;
  const dueDate = payload.dueDate ? atUtcDate(payload.dueDate) : undefined;
  const percent = payload.amount && access.project.contractValue && Number(access.project.contractValue) > 0
    ? (payload.amount / Number(access.project.contractValue)) * 100
    : undefined;

  const payment = await prisma.paymentSchedule.update({
    where: { id: params.id },
    data: {
      ...(payload.type ? { type: payload.type } : {}),
      ...(payload.installmentNo ? { installmentNo: payload.installmentNo, phaseNumber: payload.installmentNo } : {}),
      ...(payload.description ? { description: payload.description, milestoneDescription: payload.description } : {}),
      ...(payload.amount ? { amount: payload.amount, ...(percent !== undefined ? { percent } : {}) } : {}),
      ...(dueDate ? { dueDate, expectedDate: dueDate } : {}),
      ...(payload.paymentNote !== undefined ? { paymentNote: payload.paymentNote || null, notes: payload.paymentNote || null } : {}),
    },
  });

  const { diff, lines } = buildDiff(
    { installmentNo: before.installmentNo, description: before.description, amount: before.amount ? Number(before.amount) : null, dueDate: before.dueDate, paymentNote: before.paymentNote },
    { installmentNo: payment.installmentNo, description: payment.description, amount: payment.amount ? Number(payment.amount) : null, dueDate: payment.dueDate, paymentNote: payment.paymentNote },
    [
      { key: "installmentNo", label: "Đợt" },
      { key: "description", label: "Mô tả" },
      { key: "amount", label: "Số tiền", format: fmtMoney },
      { key: "dueDate", label: "Hạn", format: fmtDate },
      { key: "paymentNote", label: "Ghi chú" },
    ],
  );
  if (Object.keys(diff).length > 0) {
    await logProjectActivity(prisma, {
      projectId: payment.projectId,
      actorId: access.user.id,
      entity: "payment_schedule",
      entityId: payment.id,
      action: "update",
      summary: joinSummary(`Sửa đợt TT #${payment.installmentNo}`, lines, `Cập nhật đợt TT #${payment.installmentNo}`),
      diff,
    });
  }

  return NextResponse.json({ payment, message: "Đã cập nhật đợt thanh toán" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const access = await requirePaymentEditAccess(params.id);
  if (access.error) return access.error;
  if (isPaid(access.payment.status)) return NextResponse.json({ message: "Đợt đã thu không được xóa" }, { status: 400 });

  const before = await prisma.paymentSchedule.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await logProjectActivity(tx, {
      projectId: before.projectId,
      actorId: access.user.id,
      entity: "payment_schedule",
      entityId: before.id,
      action: "delete",
      summary: `Xóa đợt TT #${before.installmentNo} "${before.description}" — ${fmtMoney(before.amount)}`,
      snapshot: before,
    });
    await tx.paymentSchedule.delete({ where: { id: params.id } });
  });

  return NextResponse.json({ message: "Đã xóa đợt thanh toán" });
}
