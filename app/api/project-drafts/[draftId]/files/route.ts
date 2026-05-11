import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ProjectAiAuditAction, ProjectDraftFileKind } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const fileKindSchema = z.nativeEnum(ProjectDraftFileKind);

const ALLOWED_FILES: Record<ProjectDraftFileKind, { extensions: string[]; mimeTypes: string[]; label: string }> = {
  [ProjectDraftFileKind.contract]: {
    extensions: ["pdf", "doc", "docx"],
    mimeTypes: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    label: "HĐ chỉ hỗ trợ PDF/DOC/DOCX",
  },
  [ProjectDraftFileKind.estimate]: {
    extensions: ["xls", "xlsx"],
    mimeTypes: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    label: "Dự toán chỉ hỗ trợ XLS/XLSX",
  },
  [ProjectDraftFileKind.drawing]: {
    extensions: ["pdf"],
    mimeTypes: ["application/pdf"],
    label: "Bản vẽ chỉ hỗ trợ PDF",
  },
  [ProjectDraftFileKind.appendix]: {
    extensions: ["pdf", "doc", "docx"],
    mimeTypes: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    label: "Phụ lục chỉ hỗ trợ PDF/DOC/DOCX",
  },
  [ProjectDraftFileKind.other]: {
    extensions: ["pdf", "doc", "docx", "xls", "xlsx"],
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    label: "File khác chỉ hỗ trợ PDF/DOC/DOCX/XLS/XLSX",
  },
};

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
}

function fileExtension(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function isAllowedFile(file: File, kind: ProjectDraftFileKind) {
  const config = ALLOWED_FILES[kind];
  const ext = fileExtension(file.name);
  const mimeType = file.type.toLowerCase();
  const mimeOk = !mimeType || mimeType === "application/octet-stream" || config.mimeTypes.includes(mimeType);
  return config.extensions.includes(ext) && mimeOk;
}

function fileViewUrl(draftId: string, fileId: string) {
  return `/api/project-drafts/${draftId}/files/${fileId}/file`;
}

export async function POST(request: Request, { params }: { params: { draftId: string } }) {
  let current;
  try {
    current = await requireRole(["admin", "construction_manager"]);
  } catch (error) {
    return authError(error);
  }

  const draft = await prisma.projectChangeDraft.findUnique({ where: { id: params.draftId }, select: { id: true } });
  if (!draft) return NextResponse.json({ message: "Không tìm thấy bản nháp" }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get("file");
  const parsedKind = fileKindSchema.safeParse(String(formData.get("fileKind") || ""));
  if (!parsedKind.success) return NextResponse.json({ message: "Loại hồ sơ không hợp lệ" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ message: "File hồ sơ là bắt buộc" }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ message: "File hồ sơ rỗng" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ message: "File hồ sơ tối đa 50MB" }, { status: 400 });
  if (!isAllowedFile(file, parsedKind.data)) {
    return NextResponse.json({ message: ALLOWED_FILES[parsedKind.data].label }, { status: 400 });
  }

  const id = randomUUID();
  const key = `project-drafts/${params.draftId}/files/${id}_${safeFilename(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await putObjectToMinio({ key, body: buffer, contentType: file.type || "application/octet-stream" });

  const draftFile = await prisma.$transaction(async (tx) => {
    const created = await tx.projectDraftFile.create({
      data: {
        id,
        draftId: params.draftId,
        fileKind: parsedKind.data,
        fileUrl: `minio://${key}`,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        uploadedBy: current.id,
      },
    });

    await tx.projectAiAudit.create({
      data: {
        draftId: params.draftId,
        actorId: current.id,
        action: ProjectAiAuditAction.upload_file,
        payload: { fileId: created.id, fileKind: created.fileKind, fileName: created.fileName, fileSize: created.fileSize },
      },
    });

    return created;
  });

  return NextResponse.json({ file: { ...draftFile, viewUrl: fileViewUrl(params.draftId, draftFile.id) }, message: "Đã upload hồ sơ" });
}
