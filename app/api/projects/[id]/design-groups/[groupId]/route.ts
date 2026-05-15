import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { deleteObjectFromMinio } from "@/lib/minio";
import { extractMinioKey } from "@/lib/design-photos";

export const runtime = "nodejs";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  visibleToCustomer: z.boolean().optional(),
});

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

export async function PATCH(request: Request, { params }: { params: { id: string; groupId: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const group = await prisma.designPhotoGroup.findFirst({
    where: { id: params.groupId, projectId: params.id },
    select: { id: true },
  });
  if (!group) return NextResponse.json({ message: "Không tìm thấy nhóm ảnh" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  await prisma.designPhotoGroup.update({
    where: { id: params.groupId },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.visibleToCustomer !== undefined ? { visibleToCustomer: parsed.data.visibleToCustomer } : {}),
    },
  });

  return NextResponse.json({ message: "Đã cập nhật nhóm ảnh" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string; groupId: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const group = await prisma.designPhotoGroup.findFirst({
    where: { id: params.groupId, projectId: params.id },
    include: { photos: { select: { photoUrl: true, thumbnailUrl: true } } },
  });
  if (!group) return NextResponse.json({ message: "Không tìm thấy nhóm ảnh" }, { status: 404 });

  await prisma.designPhotoGroup.delete({ where: { id: params.groupId } });

  const keys: string[] = [];
  for (const photo of group.photos) {
    const photoKey = extractMinioKey(photo.photoUrl);
    const thumbKey = extractMinioKey(photo.thumbnailUrl);
    if (photoKey) keys.push(photoKey);
    if (thumbKey) keys.push(thumbKey);
  }
  await Promise.allSettled(keys.map((key) => deleteObjectFromMinio(key)));

  return NextResponse.json({ message: "Đã xoá nhóm ảnh và toàn bộ ảnh kèm theo" });
}
