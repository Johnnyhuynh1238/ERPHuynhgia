import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const KT_ROLES = new Set<string>([UserRole.accountant, UserRole.admin]);

// KT huỷ lệnh khi còn pending (chưa duyệt).
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!KT_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const order = await prisma.supplierPaymentOrder.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, createdBy: true },
  });
  if (!order) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (order.status !== "pending") {
    return NextResponse.json({ message: "Chỉ huỷ được lệnh chưa duyệt" }, { status: 400 });
  }
  if (user.role !== UserRole.admin && order.createdBy !== user.id) {
    return NextResponse.json({ message: "Chỉ người tạo hoặc admin được huỷ" }, { status: 403 });
  }

  await prisma.supplierPaymentOrder.update({
    where: { id: order.id },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
