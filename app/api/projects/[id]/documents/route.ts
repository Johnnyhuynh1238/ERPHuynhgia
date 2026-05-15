import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ProjectDocumentCategory } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { buildDocumentVisibilityWhere, sha256Hex } from "@/lib/project-document-permissions";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const categorySchema = z.nativeEnum(ProjectDocumentCategory);

const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg"]);

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

function fileViewUrl(projectId: string, docId: string) {
  return `/api/projects/${projectId}/documents/${docId}/file`;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let current;
  try {
    current = await requireRole(["admin", "engineer", "foreman", "accountant", "construction_manager"]);
  } catch (error) {
    return authError(error);
  }

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const isAdmin = current.role === "admin";

  const baseSelect = {
    id: true,
    title: true,
    category: true,
    fileName: true,
    fileSize: true,
    mimeType: true,
    uploadedBy: true,
    uploadedAt: true,
    visibleToCustomer: true,
    uploader: { select: { id: true, fullName: true } },
  } as const;

  const documents = isAdmin
    ? await prisma.projectDocument.findMany({
        where: { projectId: params.id },
        select: {
          ...baseSelect,
          accessList: {
            select: { user: { select: { id: true, fullName: true, role: true } } },
          },
        },
        orderBy: { uploadedAt: "desc" },
      })
    : await prisma.projectDocument.findMany({
        where: {
          projectId: params.id,
          ...buildDocumentVisibilityWhere({ id: current.id, role: current.role }),
        },
        select: baseSelect,
        orderBy: { uploadedAt: "desc" },
      });

  const result = documents.map((doc) => {
    const accessList = "accessList" in doc
      ? (doc.accessList as Array<{ user: { id: string; fullName: string; role: string } }>)
      : undefined;
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      uploader: doc.uploader,
      uploadedAt: doc.uploadedAt,
      visibleToCustomer: doc.visibleToCustomer,
      viewUrl: fileViewUrl(params.id, doc.id),
      grantedUsers: accessList ? accessList.map((a) => a.user) : undefined,
    };
  });

  return NextResponse.json({ documents: result });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let current;
  try {
    current = await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get("file");
  const titleRaw = String(formData.get("title") || "").trim();
  const categoryRaw = String(formData.get("category") || ProjectDocumentCategory.contract);

  const parsedCategory = categorySchema.safeParse(categoryRaw);
  if (!parsedCategory.success) return NextResponse.json({ message: "Loại hồ sơ không hợp lệ" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ message: "File hồ sơ là bắt buộc" }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ message: "File hồ sơ rỗng" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ message: "File hồ sơ tối đa 50MB" }, { status: 400 });
  const ext = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ message: "Chỉ hỗ trợ PDF/DOC/DOCX/XLS/XLSX/PNG/JPG" }, { status: 400 });
  }

  const id = randomUUID();
  const key = `projects/${params.id}/documents/${id}_${safeFilename(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = sha256Hex(buffer);
  await putObjectToMinio({ key, body: buffer, contentType: file.type || "application/octet-stream" });

  const doc = await prisma.projectDocument.create({
    data: {
      id,
      projectId: params.id,
      title: titleRaw || file.name,
      category: parsedCategory.data,
      fileUrl: `minio://${key}`,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      contentHash,
      uploadedBy: current.id,
    },
    select: {
      id: true,
      title: true,
      category: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      uploadedAt: true,
      visibleToCustomer: true,
      uploader: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json({
    document: { ...doc, viewUrl: fileViewUrl(params.id, doc.id), grantedUsers: [] },
    message: "Đã upload hồ sơ",
  });
}
