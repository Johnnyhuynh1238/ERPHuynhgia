import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// POST: duyệt toàn bộ line của hạng mục một phát
export async function POST(_req: Request, { params }: { params: { itemId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const item = await prisma.estimateItem.findUnique({ where: { id: params.itemId }, select: { id: true } });
  if (!item) return NextResponse.json({ message: "Không tìm thấy hạng mục" }, { status: 404 });

  const count = await prisma.estimateLine.count({ where: { itemId: item.id } });
  if (count === 0) return NextResponse.json({ message: "Hạng mục chưa có công tác nào" }, { status: 400 });

  await prisma.$transaction([
    prisma.estimateLine.updateMany({ where: { itemId: item.id }, data: { status: "approved" } }),
    prisma.estimateItem.update({ where: { id: item.id }, data: { status: "approved" } }),
  ]);
  return NextResponse.json({ ok: true });
}
