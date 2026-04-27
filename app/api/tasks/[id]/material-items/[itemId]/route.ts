import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canManageItem, canUpdateQc, getTaskWithAccess } from "@/lib/task-permissions";

const patchSchema = z.object({
  isAvailable: z.boolean().optional(),
  name: z.string().trim().min(1).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  if (!canUpdateQc(task, { id: user.id, role: user.role })) return NextResponse.json({ message: "Không có quyền cập nhật vật tư" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  if (parsed.data.isAvailable === undefined && parsed.data.name === undefined) return NextResponse.json({ message: "Không có dữ liệu cập nhật" }, { status: 400 });

  const existing = await prisma.taskMaterialItem.findFirst({ where: { id: params.itemId, taskId: params.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ message: "Không tìm thấy vật tư" }, { status: 404 });

  const item = await prisma.taskMaterialItem.update({ where: { id: existing.id }, data: parsed.data });
  return NextResponse.json({ item, message: "Đã cập nhật vật tư" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string; itemId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  if (!canManageItem(task, { id: user.id, role: user.role })) return NextResponse.json({ message: "Không có quyền xóa vật tư" }, { status: 403 });

  const existing = await prisma.taskMaterialItem.findFirst({ where: { id: params.itemId, taskId: params.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ message: "Không tìm thấy vật tư" }, { status: 404 });

  await prisma.taskMaterialItem.delete({ where: { id: existing.id } });
  return NextResponse.json({ message: "Đã xóa vật tư" });
}
