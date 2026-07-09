import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// POST: thêm hạng mục vào nhóm. body {name}
export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const group = await prisma.estimateGroup.findUnique({ where: { id: params.groupId }, select: { id: true } });
  if (!group) return NextResponse.json({ message: "Không tìm thấy nhóm" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ message: "Thiếu tên hạng mục" }, { status: 400 });

  const max = await prisma.estimateItem.aggregate({
    where: { groupId: group.id },
    _max: { sortOrder: true },
  });
  // Trùng tên mẫu chung → copy mô tả mặc định vào dự án
  const def = await prisma.estimateItemDefault.findUnique({ where: { name }, select: { method: true } });
  const item = await prisma.estimateItem.create({
    data: { groupId: group.id, name, method: def?.method ?? null, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  return NextResponse.json({ id: item.id });
}
