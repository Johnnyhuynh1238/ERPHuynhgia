import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { deleteObjectFromMinio } from "@/lib/minio";

function extractMinioKey(value: string) {
  if (value.startsWith("minio://")) return value.slice("minio://".length);
  try {
    return new URL(value, "http://local").searchParams.get("key");
  } catch {
    return null;
  }
}

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

  if (user.role !== UserRole.admin && user.role !== UserRole.construction_manager && photo.uploadedBy !== user.id) {
    return NextResponse.json({ message: "Không có quyền xóa ảnh này" }, { status: 403 });
  }

  await prisma.taskPhoto.delete({ where: { id: photo.id } });

  const photoKey = extractMinioKey(photo.photoUrl);
  const thumbKey = extractMinioKey(photo.thumbnailUrl);

  await Promise.allSettled([
    photoKey ? deleteObjectFromMinio(photoKey) : Promise.resolve(),
    thumbKey ? deleteObjectFromMinio(thumbKey) : Promise.resolve(),
  ]);

  return NextResponse.json({ message: "Đã xóa ảnh" });
}
