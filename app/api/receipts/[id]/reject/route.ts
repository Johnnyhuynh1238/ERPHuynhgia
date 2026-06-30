import { NextResponse } from "next/server";
import { ReceiptStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fireAndForget, notifyReceiptKtRejected } from "@/lib/notifications";

const rejectSchema = z.object({
  reason: z.string().trim().min(3, "Lý do từ chối tối thiểu 3 ký tự").max(500),
});

function canReject(role: string) {
  return role === UserRole.admin;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canReject(user.role)) {
    return NextResponse.json({ message: "Chỉ admin được từ chối" }, { status: 403 });
  }

  const parsed = rejectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const reason = parsed.data.reason.trim();

  const current = await prisma.receipt.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, status: true, createdBy: true },
  });
  if (!current) return NextResponse.json({ message: "Lệnh thu không tồn tại" }, { status: 404 });
  if (current.status !== ReceiptStatus.awaiting_approval) {
    return NextResponse.json({ message: "Lệnh thu đã được xử lý trước đó" }, { status: 409 });
  }

  const updated = await prisma.receipt.update({
    where: { id: current.id },
    data: {
      status: ReceiptStatus.cancelled,
      cancelledBy: user.id,
      cancelledAt: new Date(),
      cancelledReason: reason,
      rejectedReason: reason,
    },
  });

  fireAndForget(
    notifyReceiptKtRejected({
      receiptId: updated.id,
      code: updated.code,
      reason,
      ktUserId: current.createdBy,
      actorUserId: user.id,
      actorName: user.name || user.email || "Admin",
    }),
  );

  return NextResponse.json({ message: "Đã từ chối lệnh thu." });
}
