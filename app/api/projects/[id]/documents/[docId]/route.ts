import { NextResponse } from "next/server";
import { ProjectDocumentCategory } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { deleteObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

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

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const doc = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: params.id },
    select: { id: true },
  });
  if (!doc) return NextResponse.json({ message: "Không tìm thấy hồ sơ" }, { status: 404 });

  const updated = await prisma.projectDocument.update({
    where: { id: params.docId },
    data: parsed.data,
    select: { id: true, title: true, category: true, visibleToCustomer: true },
  });

  return NextResponse.json({ document: updated, message: "Đã cập nhật hồ sơ" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string; docId: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const doc = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: params.id },
    select: { id: true, fileUrl: true },
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

  return NextResponse.json({ message: "Đã xóa hồ sơ" });
}
