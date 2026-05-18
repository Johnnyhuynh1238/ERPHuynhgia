import { NextResponse } from "next/server";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { deleteObjectFromMinio } from "@/lib/minio";
import { extractMinioKey } from "@/lib/design-photos";
import { logProjectActivity } from "@/lib/project-activity-log";

export const runtime = "nodejs";

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

export async function DELETE(_request: Request, { params }: { params: { id: string; groupId: string; photoId: string } }) {
  let actor;
  try {
    await requireRole(["admin"]);
    actor = await getCurrentUser();
  } catch (error) {
    return authError(error);
  }

  const photo = await prisma.designPhoto.findFirst({
    where: { id: params.photoId, groupId: params.groupId, group: { projectId: params.id } },
    select: {
      id: true,
      photoUrl: true,
      thumbnailUrl: true,
      fileSizeKb: true,
      displayOrder: true,
      uploadedBy: true,
      group: { select: { title: true } },
    },
  });
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  await prisma.designPhoto.delete({ where: { id: photo.id } });

  const photoKey = extractMinioKey(photo.photoUrl);
  const thumbKey = extractMinioKey(photo.thumbnailUrl);
  await Promise.allSettled([
    photoKey ? deleteObjectFromMinio(photoKey) : Promise.resolve(),
    thumbKey ? deleteObjectFromMinio(thumbKey) : Promise.resolve(),
  ]);

  if (actor?.id) {
    await logProjectActivity(prisma, {
      projectId: params.id,
      actorId: actor.id,
      entity: "design_photo",
      entityId: photo.id,
      action: "delete",
      summary: `Xoá 1 ảnh khỏi nhóm "${photo.group.title}"`,
      snapshot: {
        groupId: params.groupId,
        photoUrl: photo.photoUrl,
        thumbnailUrl: photo.thumbnailUrl,
        fileSizeKb: photo.fileSizeKb,
        displayOrder: photo.displayOrder,
        uploadedBy: photo.uploadedBy,
      },
    });
  }

  return NextResponse.json({ message: "Đã xoá ảnh" });
}
