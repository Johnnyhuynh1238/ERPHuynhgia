import { NextResponse } from "next/server";
import { ProjectAiAuditAction } from "@prisma/client";
import { requireRole } from "@/lib/auth-helpers";
import { deleteObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

function minioKey(url: string) {
  return url.startsWith("minio://") ? url.slice("minio://".length) : null;
}

export async function DELETE(_request: Request, { params }: { params: { draftId: string; fileId: string } }) {
  let current;
  try {
    current = await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const file = await prisma.projectDraftFile.findFirst({
    where: { id: params.fileId, draftId: params.draftId },
    select: { id: true, draftId: true, fileUrl: true, fileName: true, fileKind: true },
  });
  if (!file) return NextResponse.json({ message: "Không tìm thấy hồ sơ" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.projectDraftFile.delete({ where: { id: file.id } });
    await tx.projectAiAudit.create({
      data: {
        draftId: file.draftId,
        actorId: current.id,
        action: ProjectAiAuditAction.delete_file,
        payload: { fileId: file.id, fileKind: file.fileKind, fileName: file.fileName },
      },
    });
  });

  const key = minioKey(file.fileUrl);
  if (key) await Promise.allSettled([deleteObjectFromMinio(key)]);

  return NextResponse.json({ message: "Đã xóa hồ sơ" });
}
