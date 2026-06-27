import { NextResponse } from "next/server";
import { ReceiptStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fireAndForget, notifyReceiptCancelled } from "@/lib/notifications";

const schema = z.object({
  reason: z.string().trim().min(1, "Lý do huỷ bắt buộc").max(2000),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được huỷ lệnh thu" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const row = await prisma.receipt.findUnique({ where: { id: params.id }, select: { id: true, status: true, code: true } });
  if (!row) return NextResponse.json({ message: "Không tìm thấy lệnh thu" }, { status: 404 });
  if (row.status !== ReceiptStatus.pending) {
    return NextResponse.json({ message: "Chỉ huỷ được lệnh đang chờ thu" }, { status: 400 });
  }

  const reason = parsed.data.reason.trim();
  await prisma.receipt.update({
    where: { id: row.id },
    data: {
      status: ReceiptStatus.cancelled,
      cancelledBy: user.id,
      cancelledAt: new Date(),
      cancelledReason: reason,
    },
  });

  fireAndForget(
    notifyReceiptCancelled({
      receiptId: row.id,
      code: row.code,
      reason,
      actorUserId: user.id,
      actorName: user.name || user.email || "Admin",
    }),
  );

  return NextResponse.json({ message: "Đã huỷ lệnh thu" });
}
