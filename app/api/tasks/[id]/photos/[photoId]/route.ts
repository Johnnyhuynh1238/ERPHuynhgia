import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; photoId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const photo = await prisma.taskPhoto.findFirst({
    where: {
      id: params.photoId,
      taskId: params.id,
    },
    select: {
      id: true,
      uploadedBy: true,
      photoUrl: true,
      thumbnailUrl: true,
    },
  });

  if (!photo) {
    return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });
  }

  if (user.role !== UserRole.admin && photo.uploadedBy !== user.id) {
    return NextResponse.json({ message: "Không có quyền xóa ảnh này" }, { status: 403 });
  }

  await prisma.taskPhoto.delete({ where: { id: photo.id } });

  const absolutePhoto = path.join(process.cwd(), "public", photo.photoUrl.replace(/^\//, ""));
  const absoluteThumb = path.join(process.cwd(), "public", photo.thumbnailUrl.replace(/^\//, ""));

  await Promise.allSettled([fs.unlink(absolutePhoto), fs.unlink(absoluteThumb)]);

  return NextResponse.json({ message: "Đã xóa ảnh" });
}
