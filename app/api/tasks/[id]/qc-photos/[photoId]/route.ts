import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTaskWithAccess } from "@/lib/task-permissions";

function canDeleteQcPhoto(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

export async function DELETE(_request: Request, { params }: { params: { id: string; photoId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const photo = await prisma.qcPhoto.findFirst({
    where: { id: params.photoId, taskId: params.id },
    select: { id: true, uploadedBy: true },
  });

  if (!photo) {
    return NextResponse.json({ message: "Không tìm thấy ảnh QC" }, { status: 404 });
  }

  if (!canDeleteQcPhoto(user.role) && photo.uploadedBy !== user.id) {
    return NextResponse.json({ message: "Không có quyền xóa ảnh này" }, { status: 403 });
  }

  await prisma.qcPhoto.delete({ where: { id: photo.id } });
  return NextResponse.json({ message: "Đã xóa ảnh QC" });
}
