import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { deleteObjectFromMinio } from "@/lib/minio";
import { extractMinioKey } from "@/lib/design-photos";
import { buildDiff, joinSummary, logProjectActivity } from "@/lib/project-activity-log";

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
    select: { id: true, title: true, description: true, visibleToCustomer: true },
  });
  if (!group) return NextResponse.json({ message: "Không tìm thấy nhóm ảnh" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const actor = await getCurrentUser();

  const updated = await prisma.designPhotoGroup.update({
    where: { id: params.groupId },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.visibleToCustomer !== undefined ? { visibleToCustomer: parsed.data.visibleToCustomer } : {}),
    },
    select: { id: true, title: true, description: true, visibleToCustomer: true },
  });

  const { diff, lines } = buildDiff(
    { title: group.title, description: group.description, visibleToCustomer: group.visibleToCustomer },
    { title: updated.title, description: updated.description, visibleToCustomer: updated.visibleToCustomer },
    [
      { key: "title", label: "Tiêu đề" },
      { key: "description", label: "Mô tả" },
      { key: "visibleToCustomer", label: "CN xem được" },
    ],
  );
  if (Object.keys(diff).length > 0 && actor?.id) {
    await logProjectActivity(prisma, {
      projectId: params.id,
      actorId: actor.id,
      entity: "design_group",
      entityId: updated.id,
      action: "update",
      summary: joinSummary(`Sửa nhóm ảnh "${updated.title}"`, lines, `Cập nhật nhóm ảnh "${updated.title}"`),
      diff,
    });
  }

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

  const actor = await getCurrentUser();

  await prisma.designPhotoGroup.delete({ where: { id: params.groupId } });

  const keys: string[] = [];
  for (const photo of group.photos) {
    const photoKey = extractMinioKey(photo.photoUrl);
    const thumbKey = extractMinioKey(photo.thumbnailUrl);
    if (photoKey) keys.push(photoKey);
    if (thumbKey) keys.push(thumbKey);
  }
  await Promise.allSettled(keys.map((key) => deleteObjectFromMinio(key)));

  if (actor?.id) {
    await logProjectActivity(prisma, {
      projectId: params.id,
      actorId: actor.id,
      entity: "design_group",
      entityId: group.id,
      action: "delete",
      summary: `Xóa nhóm ảnh "${group.title}" (${group.photos.length} ảnh)`,
      snapshot: { id: group.id, title: group.title, description: group.description, visibleToCustomer: group.visibleToCustomer, photoCount: group.photos.length },
    });
  }

  return NextResponse.json({ message: "Đã xoá nhóm ảnh và toàn bộ ảnh kèm theo" });
}
