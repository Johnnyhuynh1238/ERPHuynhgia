import { NextResponse } from "next/server";
import { ProjectDocumentCategory } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { deleteObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { buildDiff, joinSummary, logProjectActivity } from "@/lib/project-activity-log";

export const runtime = "nodejs";

const updateSchema = z.object({
  title: z.string().trim().min(1, "Tiêu đề không được trống").optional(),
  category: z.nativeEnum(ProjectDocumentCategory).optional(),
  visibleToCustomer: z.boolean().optional(),
});

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

function minioKey(url: string) {
  return url.startsWith("minio://") ? url.slice("minio://".length) : null;
}

export async function PATCH(request: Request, { params }: { params: { id: string; docId: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const actor = await getCurrentUser();

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const doc = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: params.id },
    select: { id: true, title: true, category: true, visibleToCustomer: true },
  });
  if (!doc) return NextResponse.json({ message: "Không tìm thấy hồ sơ" }, { status: 404 });

  const updated = await prisma.projectDocument.update({
    where: { id: params.docId },
    data: parsed.data,
    select: { id: true, title: true, category: true, visibleToCustomer: true },
  });

  const { diff, lines } = buildDiff(
    { title: doc.title, category: doc.category, visibleToCustomer: doc.visibleToCustomer },
    { title: updated.title, category: updated.category, visibleToCustomer: updated.visibleToCustomer },
    [
      { key: "title", label: "Tiêu đề" },
      { key: "category", label: "Loại" },
      { key: "visibleToCustomer", label: "CN xem được" },
    ],
  );

  if (Object.keys(diff).length > 0 && actor?.id) {
    await logProjectActivity(prisma, {
      projectId: params.id,
      actorId: actor.id,
      entity: "project_document",
      entityId: updated.id,
      action: "update",
      summary: joinSummary(`Sửa hồ sơ "${updated.title}"`, lines, `Cập nhật hồ sơ "${updated.title}"`),
      diff,
    });
  }

  return NextResponse.json({ document: updated, message: "Đã cập nhật hồ sơ" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string; docId: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const actor = await getCurrentUser();

  const doc = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: params.id },
    select: { id: true, fileUrl: true, title: true, category: true, fileName: true, fileSize: true, mimeType: true, visibleToCustomer: true, uploadedBy: true, uploadedAt: true },
  });
  if (!doc) return NextResponse.json({ message: "Không tìm thấy hồ sơ" }, { status: 404 });

  const key = minioKey(doc.fileUrl);
  if (key) {
    try {
      await deleteObjectFromMinio(key);
    } catch (error) {
      console.warn("[documents] failed to delete MinIO object", key, error);
    }
  }

  await prisma.projectDocument.delete({ where: { id: params.docId } });

  if (actor?.id) {
    await logProjectActivity(prisma, {
      projectId: params.id,
      actorId: actor.id,
      entity: "project_document",
      entityId: doc.id,
      action: "delete",
      summary: `Xóa hồ sơ "${doc.title}" (${doc.category})`,
      snapshot: doc,
    });
  }

  return NextResponse.json({ message: "Đã xóa hồ sơ" });
}
