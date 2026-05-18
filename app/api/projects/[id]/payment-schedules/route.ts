import { NextResponse } from "next/server";
import { PaymentStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { normalizePaymentSchedule } from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { fmtDate, fmtMoney, logProjectActivity } from "@/lib/project-activity-log";

const createPaymentSchema = z.object({
  type: z.enum(["contract", "addendum"]).optional().default("contract"),
  installmentNo: z.coerce.number().int().min(1),
  description: z.string().trim().min(1, "Mô tả là bắt buộc"),
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày hạn không hợp lệ"),
});

function canView(role: UserRole) {
  return role === UserRole.admin || role === UserRole.accountant || role === UserRole.construction_manager;
}

function canEdit(role: UserRole) {
  return role === UserRole.admin || role === UserRole.accountant;
}

function atUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function diffDays(from: Date, to: Date) {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.floor((b - a) / (24 * 60 * 60 * 1000)));
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canView(user.role as UserRole)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true, customerName: true, contractValue: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const rows = await prisma.paymentSchedule.findMany({
    where: { projectId: params.id },
    orderBy: [{ type: "asc" }, { installmentNo: "asc" }, { phaseNumber: "asc" }],
    select: {
      id: true,
      type: true,
      installmentNo: true,
      phaseNumber: true,
      description: true,
      milestoneDescription: true,
      amount: true,
      dueDate: true,
      expectedDate: true,
      status: true,
      paidAt: true,
      paidAmount: true,
      actualPaidDate: true,
      actualPaidAmount: true,
      receiptUrl: true,
      paymentNote: true,
      notes: true,
    },
  });

  return NextResponse.json({ project, payments: rows.map(normalizePaymentSchedule), canEdit: canEdit(user.role as UserRole) });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEdit(user.role as UserRole)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, startDate: true, contractValue: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = createPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });

  const payload = parsed.data;
  const dueDate = atUtcDate(payload.dueDate);
  const percent = project.contractValue && Number(project.contractValue) > 0 ? (payload.amount / Number(project.contractValue)) * 100 : 0;

  const payment = await prisma.paymentSchedule.create({
    data: {
      projectId: params.id,
      type: payload.type,
      installmentNo: payload.installmentNo,
      description: payload.description,
      amount: payload.amount,
      dueDate,
      status: PaymentStatus.pending,
      createdBy: user.id,
      phaseNumber: payload.installmentNo,
      milestoneDescription: payload.description,
      percent,
      expectedDate: dueDate,
      dayOffset: diffDays(project.startDate, dueDate),
    },
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "payment_schedule",
    entityId: payment.id,
    action: "create",
    summary: `Tạo đợt TT #${payment.installmentNo} "${payment.description}" — ${fmtMoney(payment.amount)} (hạn ${fmtDate(payment.dueDate)})`,
    metadata: {
      type: payment.type,
      installmentNo: payment.installmentNo,
      amount: Number(payment.amount),
      dueDate: payment.dueDate ? payment.dueDate.toISOString() : null,
    },
  });

  return NextResponse.json({ payment, message: "Đã tạo đợt thanh toán" });
}
