import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ProjectDocumentCategory } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/project-document-permissions";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import {
  CAD_EXTENSIONS,
  DOC_STATUSES,
  categoryForGroup,
  customerVisibleByGroup,
  ensureProjectDocGroups,
  fileExtension,
  loadProjectDocsView,
} from "@/lib/project-doc-groups";
import { logProjectActivity } from "@/lib/project-activity-log";
import { designStepLabel, isDesignStep } from "@/lib/design-steps";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const categorySchema = z.nativeEnum(ProjectDocumentCategory);

const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg", ...Array.from(CAD_EXTENSIONS)]);

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let current;
  try {
    current = await requireRole(["admin", "engineer", "foreman", "accountant", "construction_manager"]);
  } catch (error) {
    return authError(error);
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: current.id, role: current.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const data = await loadProjectDocsView(params.id, { id: current.id, role: current.role });
  return NextResponse.json(data);
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

  // Màn GĐ 4 Thiết kế gửi kèm designStep: file đã được khách duyệt → bật xem ở cổng chủ nhà luôn.
  const designStepRaw = String(formData.get("designStep") || "").trim();
  if (designStepRaw && (!isDesignStep(designStepRaw) || designStepRaw === "phoi_canh")) {
    return NextResponse.json({ message: "Bước thiết kế không hợp lệ" }, { status: 400 });
  }
  const designStep = designStepRaw || null;

  const parsedCategory = categorySchema.safeParse(categoryRaw);
  if (!parsedCategory.success) return NextResponse.json({ message: "Loại hồ sơ không hợp lệ" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ message: "File hồ sơ là bắt buộc" }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ message: "File hồ sơ rỗng" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ message: "File hồ sơ tối đa 50MB" }, { status: 400 });
  const ext = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ message: "Chỉ hỗ trợ PDF/DOC/DOCX/XLS/XLSX/PNG/JPG/DWG/DXF/RVT/SKP/ZIP/RAR" }, { status: 400 });
  }

  // Màn Hồ sơ dự án gửi groupId/subfolder/status; replaceId = tải bản mới thay cho 1 hồ sơ (lên phiên bản).
  const groupIdRaw = String(formData.get("groupId") || "").trim();
  const subfolderRaw = String(formData.get("subfolder") || "").trim().slice(0, 60);
  const statusRaw = String(formData.get("status") || "").trim();
  const replaceIdRaw = String(formData.get("replaceId") || "").trim();
  if (statusRaw && !(DOC_STATUSES as readonly string[]).includes(statusRaw)) {
    return NextResponse.json({ message: "Trạng thái không hợp lệ" }, { status: 400 });
  }

  const replaced = replaceIdRaw
    ? await prisma.projectDocument.findFirst({
        where: { id: replaceIdRaw, projectId: params.id },
        select: {
          id: true, versionOfId: true, groupId: true, subfolder: true, status: true, accessMode: true,
          category: true, designStep: true, visibleToCustomer: true, title: true,
          accessList: { select: { userId: true } },
        },
      })
    : null;
  if (replaceIdRaw && !replaced) return NextResponse.json({ message: "Không tìm thấy hồ sơ cần thay" }, { status: 404 });

  let group: { id: string; systemKey: string | null; permCustomer: boolean } | null = null;
  const targetGroupId = replaced ? replaced.groupId : groupIdRaw || null;
  if (targetGroupId) {
    await ensureProjectDocGroups(params.id);
    group = await prisma.projectDocGroup.findFirst({
      where: { id: targetGroupId, projectId: params.id },
      select: { id: true, systemKey: true, permCustomer: true },
    });
    if (!group) return NextResponse.json({ message: "Nhóm hồ sơ không hợp lệ" }, { status: 400 });
  }

  const id = randomUUID();
  const key = `projects/${params.id}/documents/${id}_${safeFilename(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = sha256Hex(buffer);
  await putObjectToMinio({ key, body: buffer, contentType: file.type || "application/octet-stream" });

  const accessMode = replaced?.accessMode ?? "group";
  const category = replaced
    ? replaced.category
    : group
      ? categoryForGroup(group.systemKey, parsedCategory.data)
      : parsedCategory.data;
  const effectiveDesignStep = replaced ? replaced.designStep : designStep;
  const isCad = CAD_EXTENSIONS.has(ext);
  let visibleToCustomer: boolean;
  if (effectiveDesignStep) visibleToCustomer = !isCad;
  else if (accessMode === "custom") visibleToCustomer = !!replaced?.visibleToCustomer && !isCad;
  else visibleToCustomer = customerVisibleByGroup(group, file.name);

  const rootId = replaced ? replaced.versionOfId ?? replaced.id : null;

  const doc = await prisma.$transaction(async (tx) => {
    let versionNo = 1;
    if (rootId) {
      const agg = await tx.projectDocument.aggregate({
        where: { OR: [{ id: rootId }, { versionOfId: rootId }] },
        _max: { versionNo: true },
      });
      versionNo = (agg._max.versionNo ?? 1) + 1;
      // Bản cũ: giữ để đối chiếu, ẩn khỏi cổng khách / mời thầu.
      await tx.projectDocument.updateMany({
        where: { OR: [{ id: rootId }, { versionOfId: rootId }] },
        data: { isCurrent: false, visibleToCustomer: false },
      });
    }
    const created = await tx.projectDocument.create({
      data: {
        id,
        projectId: params.id,
        title: titleRaw || replaced?.title || file.name,
        category,
        fileUrl: `minio://${key}`,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        contentHash,
        uploadedBy: current.id,
        designStep: effectiveDesignStep,
        visibleToCustomer,
        groupId: group?.id ?? null,
        subfolder: replaced ? replaced.subfolder : subfolderRaw || null,
        status: statusRaw || replaced?.status || null,
        accessMode,
        versionOfId: rootId,
        versionNo,
        isCurrent: true,
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
        versionNo: true,
        uploader: { select: { id: true, fullName: true } },
      },
    });
    if (replaced && replaced.accessList.length > 0) {
      await tx.projectDocumentAccess.createMany({
        data: replaced.accessList.map((a) => ({ documentId: id, userId: a.userId, grantedBy: current.id })),
        skipDuplicates: true,
      });
    }
    return created;
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: current.id,
    entity: "project_document",
    entityId: doc.id,
    action: "upload",
    summary: `Upload hồ sơ "${doc.title}"${replaced ? ` – phiên bản V${doc.versionNo}` : ""}${effectiveDesignStep ? ` – thiết kế ${designStepLabel(effectiveDesignStep)}` : ""} (${doc.category}, ${(file.size / (1024 * 1024)).toFixed(2)}MB)`,
    metadata: { title: doc.title, category: doc.category, fileName: file.name, fileSize: file.size, mimeType: doc.mimeType, versionNo: doc.versionNo },
  });

  return NextResponse.json({
    document: { ...doc, viewUrl: `/api/projects/${params.id}/documents/${doc.id}/file`, grantedUsers: [] },
    message: replaced ? `Đã tải phiên bản V${doc.versionNo}` : "Đã upload hồ sơ",
  });
}
