import { NextResponse } from "next/server";
import { ReceiptStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fireAndForget, notifyReceiptKtApproved } from "@/lib/notifications";

function canApprove(role: string) {
  return role === UserRole.admin;
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canApprove(user.role)) {
    return NextResponse.json({ message: "Chỉ admin được duyệt" }, { status: 403 });
  }

  const current = await prisma.receipt.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, status: true, createdBy: true, amount: true },
  });
  if (!current) return NextResponse.json({ message: "Lệnh thu không tồn tại" }, { status: 404 });
  if (current.status !== ReceiptStatus.awaiting_approval) {
    return NextResponse.json({ message: "Lệnh thu đã được xử lý trước đó" }, { status: 409 });
  }

  const updated = await prisma.receipt.update({
    where: { id: current.id },
    data: {
      status: ReceiptStatus.pending,
      approvedBy: user.id,
      approvedAt: new Date(),
    },
  });

  fireAndForget(
    notifyReceiptKtApproved({
      receiptId: updated.id,
      code: updated.code,
      amount: Number(updated.amount),
      ktUserId: current.createdBy,
      actorUserId: user.id,
      actorName: user.name || user.email || "Admin",
    }),
  );

  return NextResponse.json({ message: "Đã duyệt. KT có thể xác nhận đã thu." });
}
