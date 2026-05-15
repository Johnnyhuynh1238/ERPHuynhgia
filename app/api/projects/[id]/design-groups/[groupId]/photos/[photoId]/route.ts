import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { deleteObjectFromMinio } from "@/lib/minio";
import { extractMinioKey } from "@/lib/design-photos";

export const runtime = "nodejs";

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

export async function DELETE(_request: Request, { params }: { params: { id: string; groupId: string; photoId: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const photo = await prisma.designPhoto.findFirst({
    where: { id: params.photoId, groupId: params.groupId, group: { projectId: params.id } },
    select: { id: true, photoUrl: true, thumbnailUrl: true },
  });
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  await prisma.designPhoto.delete({ where: { id: photo.id } });

  const photoKey = extractMinioKey(photo.photoUrl);
  const thumbKey = extractMinioKey(photo.thumbnailUrl);
  await Promise.allSettled([
    photoKey ? deleteObjectFromMinio(photoKey) : Promise.resolve(),
    thumbKey ? deleteObjectFromMinio(thumbKey) : Promise.resolve(),
  ]);

  return NextResponse.json({ message: "Đã xoá ảnh" });
}
