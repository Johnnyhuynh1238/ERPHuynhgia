import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const KT_ROLES = new Set<string>([UserRole.accountant, UserRole.admin]);

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!KT_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const proposal = await prisma.materialProposal.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, orderStatus: true, closedAt: true },
  });
  if (!proposal) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (proposal.status !== "accepted") {
    return NextResponse.json({ message: "Đề xuất chưa duyệt" }, { status: 400 });
  }
  if (proposal.orderStatus === "not_ordered") {
    return NextResponse.json({ message: "Chưa đặt NCC — không thể đóng PO" }, { status: 400 });
  }
  if (proposal.closedAt) {
    return NextResponse.json({ message: "PO đã đóng" }, { status: 400 });
  }

  await prisma.materialProposal.update({
    where: { id: proposal.id },
    data: { closedAt: new Date(), closedBy: user.id },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  // Mở lại PO (admin only) — cho trường hợp KT bấm nhầm.
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin mở lại PO" }, { status: 403 });
  }
  await prisma.materialProposal.update({
    where: { id: params.id },
    data: { closedAt: null, closedBy: null },
  });
  return NextResponse.json({ ok: true });
}
