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

export async function POST(_request: Request, { params }: { params: { id: string; paymentId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được tạo lệnh thu từ đợt thanh toán" }, { status: 403 });
  }

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

  const alreadyReceived = await prisma.receipt.findFirst({
    where: { paymentScheduleId: schedule.id, status: ReceiptStatus.received },
    select: { id: true, code: true },
  });
  if (alreadyReceived) {
    return NextResponse.json(
      { message: `Đợt này đã được thu bằng lệnh ${alreadyReceived.code}` },
      { status: 400 },
    );
  }

  const code = await nextReceiptCode();
  const projectLabel = `${schedule.project.code} — ${schedule.project.name}`;
  const scheduleLabel = schedule.milestoneDescription || schedule.description || `Đợt ${schedule.phaseNumber}`;

  const receipt = await prisma.$transaction(async (tx) => {
    const created = await tx.receipt.create({
      data: {
        code,
        source: ReceiptSource.customer,
        projectId: schedule.projectId,
        paymentScheduleId: schedule.id,
        amount: schedule.amount,
        payer: schedule.project.customerName || null,
        paymentMethod: null,
        note: `Đợt ${schedule.phaseNumber} — ${scheduleLabel}`,
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
      data: { status: PaymentStatus.not_collected },
    });
  });

  return NextResponse.json({ message: `Đã huỷ lệnh thu ${activeReceipt.code}` });
}
