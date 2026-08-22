import { NextResponse } from "next/server";
import { PaymentStatus, Prisma, ReceiptSource, ReceiptStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fireAndForget, notifyReceiptCreated } from "@/lib/notifications";

async function nextReceiptCode() {
  const now = new Date();
  const yymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `THU-${yymm}-`;
  const last = await prisma.receipt.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNo = last ? Number(last.code.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(lastNo + 1).padStart(4, "0")}`;
}

export async function POST(request: Request, { params }: { params: { id: string; paymentId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được tạo lệnh thu từ đợt thanh toán" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const rawAmount = (body as { amount?: unknown }).amount;

  const schedule = await prisma.paymentSchedule.findFirst({
    where: { id: params.paymentId, projectId: params.id },
    include: {
      project: { select: { id: true, code: true, name: true, customerName: true } },
    },
  });
  if (!schedule) return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });

  const activeReceipt = await prisma.receipt.findFirst({
    where: {
      paymentScheduleId: schedule.id,
      status: { in: [ReceiptStatus.pending, ReceiptStatus.awaiting_approval] },
    },
    select: { id: true, code: true, status: true },
  });
  if (activeReceipt) {
    return NextResponse.json(
      { message: `Đợt này đã có lệnh thu ${activeReceipt.code} đang chờ KT xử lý` },
      { status: 400 },
    );
  }

  // Đã thu (cộng dồn các phiếu received) → còn lại; cho phép thu tiếp phần còn lại
  const receivedAgg = await prisma.receipt.aggregate({
    where: { paymentScheduleId: schedule.id, status: ReceiptStatus.received },
    _sum: { receivedAmount: true },
  });
  const scheduleAmount = Number(schedule.amount);
  const alreadyCollected = Number(receivedAgg._sum.receivedAmount || 0);
  const remaining = scheduleAmount - alreadyCollected;
  if (remaining <= 0) {
    return NextResponse.json({ message: "Đợt này đã thu đủ" }, { status: 400 });
  }

  // Số tiền thu: mặc định = phần còn lại, admin được chỉnh (thu thiếu tiếp)
  const collectAmount =
    rawAmount == null || rawAmount === "" ? remaining : Number(rawAmount);
  if (!Number.isFinite(collectAmount) || collectAmount <= 0) {
    return NextResponse.json({ message: "Số tiền thu không hợp lệ" }, { status: 400 });
  }

  const code = await nextReceiptCode();
  const projectLabel = `${schedule.project.code} — ${schedule.project.name}`;
  const scheduleLabel = schedule.milestoneDescription || schedule.description || `Đợt ${schedule.phaseNumber}`;
  const partialNote =
    collectAmount !== scheduleAmount
      ? ` (thu ${Math.round(collectAmount).toLocaleString("vi-VN")}/${Math.round(scheduleAmount).toLocaleString("vi-VN")})`
      : "";

  const receipt = await prisma.$transaction(async (tx) => {
    const created = await tx.receipt.create({
      data: {
        code,
        source: ReceiptSource.customer,
        projectId: schedule.projectId,
        paymentScheduleId: schedule.id,
        amount: new Prisma.Decimal(collectAmount),
        payer: schedule.project.customerName || null,
        paymentMethod: null,
        note: `Đợt ${schedule.phaseNumber} — ${scheduleLabel}${partialNote}`,
        status: ReceiptStatus.pending,
        createdBy: user.id,
      },
    });

    await tx.paymentSchedule.update({
      where: { id: schedule.id },
      data: { status: PaymentStatus.request_sent },
    });

    return created;
  });

  fireAndForget(
    notifyReceiptCreated({
      receiptId: receipt.id,
      code: receipt.code,
      amount: Number(receipt.amount),
      source: receipt.source,
      payer: receipt.payer,
      projectLabel,
      actorUserId: user.id,
      actorName: user.name || user.email || "Admin",
    }),
  );

  return NextResponse.json({
    receipt: {
      id: receipt.id,
      code: receipt.code,
      status: receipt.status,
      amount: Number(receipt.amount),
    },
    message: "Đã gửi lệnh thu cho kế toán",
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string; paymentId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được huỷ lệnh thu" }, { status: 403 });
  }

  const schedule = await prisma.paymentSchedule.findFirst({
    where: { id: params.paymentId, projectId: params.id },
    select: { id: true },
  });
  if (!schedule) return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });

  const activeReceipt = await prisma.receipt.findFirst({
    where: {
      paymentScheduleId: schedule.id,
      status: { in: [ReceiptStatus.pending, ReceiptStatus.awaiting_approval] },
    },
    select: { id: true, code: true },
  });
  if (!activeReceipt) {
    return NextResponse.json({ message: "Không có lệnh thu đang chờ để huỷ" }, { status: 400 });
  }

  // Nếu đã thu 1 phần (có phiếu received) → về 'partial', chưa thu gì → 'not_collected'
  const receivedCount = await prisma.receipt.count({
    where: { paymentScheduleId: schedule.id, status: ReceiptStatus.received },
  });

  await prisma.$transaction(async (tx) => {
    await tx.receipt.update({
      where: { id: activeReceipt.id },
      data: {
        status: ReceiptStatus.cancelled,
        cancelledBy: user.id,
        cancelledAt: new Date(),
        cancelledReason: "Admin huỷ từ trang lịch thanh toán",
      },
    });
    await tx.paymentSchedule.update({
      where: { id: schedule.id },
      data: { status: receivedCount > 0 ? PaymentStatus.partial : PaymentStatus.not_collected },
    });
  });

  return NextResponse.json({ message: `Đã huỷ lệnh thu ${activeReceipt.code}` });
}
