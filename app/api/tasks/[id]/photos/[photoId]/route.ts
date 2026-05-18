import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { deleteObjectFromMinio } from "@/lib/minio";
import { logProjectActivity } from "@/lib/project-activity-log";

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
      caption: true,
      fileSizeKb: true,
      task: { select: { projectId: true, code: true, name: true } },
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

  await logProjectActivity(prisma, {
    projectId: photo.task.projectId,
    actorId: user.id,
    entity: "task_photo",
    entityId: photo.id,
    action: "delete",
    summary: `Xoá 1 ảnh khỏi task ${photo.task.code} "${photo.task.name}"`,
    snapshot: {
      taskId: params.id,
      photoUrl: photo.photoUrl,
      thumbnailUrl: photo.thumbnailUrl,
      caption: photo.caption,
      fileSizeKb: photo.fileSizeKb,
      uploadedBy: photo.uploadedBy,
    },
  });

  return NextResponse.json({ message: "Đã xóa ảnh" });
}
