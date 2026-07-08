import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// PATCH: đổi tên / đổi vị trí nhóm. body {name?} | {move: "up"|"down"}
export async function PATCH(req: Request, { params }: { params: { groupId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const group = await prisma.estimateGroup.findUnique({ where: { id: params.groupId } });
  if (!group) return NextResponse.json({ message: "Không tìm thấy nhóm" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.move === "up" || body.move === "down") {
    const dir = body.move === "up" ? "lt" : "gt";
    const neighbor = await prisma.estimateGroup.findFirst({
      where: { projectId: group.projectId, sortOrder: { [dir]: group.sortOrder } },
      orderBy: { sortOrder: body.move === "up" ? "desc" : "asc" },
    });
    if (neighbor) {
      await prisma.$transaction([
        prisma.estimateGroup.update({ where: { id: group.id }, data: { sortOrder: neighbor.sortOrder } }),
        prisma.estimateGroup.update({ where: { id: neighbor.id }, data: { sortOrder: group.sortOrder } }),
      ]);
    }
    return NextResponse.json({ ok: true });
  }

  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ message: "Thiếu tên nhóm" }, { status: 400 });
  await prisma.estimateGroup.update({ where: { id: group.id }, data: { name } });
  return NextResponse.json({ ok: true });
}

// DELETE: xoá nhóm + toàn bộ hạng mục/line bên trong (cascade)
export async function DELETE(_req: Request, { params }: { params: { groupId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;
  await prisma.estimateGroup.delete({ where: { id: params.groupId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
