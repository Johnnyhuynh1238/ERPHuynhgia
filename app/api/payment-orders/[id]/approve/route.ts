import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { notifyPaymentOrderDecision } from "@/lib/notify-payment-order";

export const runtime = "nodejs";

const schema = z.object({ note: z.string().max(500).optional() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được duyệt" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const order = await prisma.supplierPaymentOrder.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, status: true, createdBy: true },
  });
  if (!order) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (order.status !== "pending") {
    return NextResponse.json({ message: "Lệnh không ở trạng thái chờ duyệt" }, { status: 400 });
  }

  await prisma.supplierPaymentOrder.update({
    where: { id: order.id },
    data: {
      status: "approved",
      approvedBy: user.id,
      approvedAt: new Date(),
      approvalNote: parsed.data.note?.trim() || null,
    },
  });

  void notifyPaymentOrderDecision({
    orderId: order.id,
    code: order.code,
    recipientId: order.createdBy,
    decision: "approved",
    actorUserId: user.id,
    actorName: user.name ?? "Admin",
    reasonNote: parsed.data.note ?? null,
  });

  return NextResponse.json({ ok: true });
}
