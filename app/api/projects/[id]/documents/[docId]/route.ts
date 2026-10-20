import { NextResponse } from "next/server";
import { Prisma, ProjectDocumentCategory } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { deleteObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { buildDiff, joinSummary, logProjectActivity } from "@/lib/project-activity-log";
import { DOC_STATUSES, categoryForGroup, customerVisibleByGroup, isCadFile } from "@/lib/project-doc-groups";

export const runtime = "nodejs";

const updateSchema = z.object({
  title: z.string().trim().min(1, "Tiêu đề không được trống").optional(),
  category: z.nativeEnum(ProjectDocumentCategory).optional(),
  visibleToCustomer: z.boolean().optional(),
  groupId: z.string().uuid().optional(),
  subfolder: z.string().trim().max(60).nullable().optional(),
  status: z.enum(DOC_STATUSES).nullable().optional(),
  accessMode: z.enum(["group", "custom"]).optional(),
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
    select: {
      id: true, title: true, category: true, visibleToCustomer: true, fileName: true, designStep: true,
      groupId: true, subfolder: true, status: true, accessMode: true, isCurrent: true, versionOfId: true,
    },
  });
  if (!doc) return NextResponse.json({ message: "Không tìm thấy hồ sơ" }, { status: 404 });

  const input = parsed.data;
  const data: Prisma.ProjectDocumentUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.category !== undefined) data.category = input.category;
  if (input.subfolder !== undefined) data.subfolder = input.subfolder || null;
  if (input.status !== undefined) data.status = input.status;

  let groupId = doc.groupId;
  if (input.groupId !== undefined && input.groupId !== doc.groupId) {
    const target = await prisma.projectDocGroup.findFirst({
      where: { id: input.groupId, projectId: params.id },
      select: { id: true, systemKey: true },
    });
    if (!target) return NextResponse.json({ message: "Nhóm hồ sơ không hợp lệ" }, { status: 400 });
    groupId = target.id;
    data.group = { connect: { id: target.id } };
    data.category = categoryForGroup(target.systemKey, input.category ?? doc.category);
    if (input.subfolder === undefined) data.subfolder = null;
  }

  // Bật/tắt khách ở chế độ theo nhóm = admin muốn khác nhóm → chuyển file sang quyền riêng.
  let accessMode = input.accessMode ?? doc.accessMode;
  if (input.visibleToCustomer !== undefined && input.accessMode === undefined && accessMode === "group") accessMode = "custom";
  data.accessMode = accessMode;

  if (accessMode === "group" && !doc.designStep) {
    const group = groupId
      ? await prisma.projectDocGroup.findUnique({ where: { id: groupId }, select: { permCustomer: true } })
      : null;
    data.visibleToCustomer = customerVisibleByGroup(group, doc.fileName, doc.isCurrent);
  } else if (input.visibleToCustomer !== undefined) {
    data.visibleToCustomer = input.visibleToCustomer && !isCadFile(doc.fileName) && doc.isCurrent;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.projectDocument.update({
      where: { id: params.docId },
      data,
      select: { id: true, title: true, category: true, visibleToCustomer: true, groupId: true, subfolder: true, status: true, accessMode: true },
    });
    // Đổi nhóm/mục con → kéo cả các bản cũ cùng chuỗi phiên bản theo.
    if (input.groupId !== undefined || input.subfolder !== undefined) {
      const rootId = doc.versionOfId ?? doc.id;
      await tx.projectDocument.updateMany({
        where: { OR: [{ id: rootId }, { versionOfId: rootId }], NOT: { id: doc.id } },
        data: { groupId: row.groupId, subfolder: row.subfolder, category: row.category },
      });
    }
    return row;
  });

  const { diff, lines } = buildDiff(
    {
      title: doc.title, category: doc.category, visibleToCustomer: doc.visibleToCustomer,
      groupId: doc.groupId, subfolder: doc.subfolder, status: doc.status, accessMode: doc.accessMode,
    },
    {
      title: updated.title, category: updated.category, visibleToCustomer: updated.visibleToCustomer,
      groupId: updated.groupId, subfolder: updated.subfolder, status: updated.status, accessMode: updated.accessMode,
    },
    [
      { key: "title", label: "Tiêu đề" },
      { key: "category", label: "Loại" },
      { key: "visibleToCustomer", label: "CN xem được" },
      { key: "groupId", label: "Nhóm" },
      { key: "subfolder", label: "Mục con" },
      { key: "status", label: "Trạng thái" },
      { key: "accessMode", label: "Quyền xem" },
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
    select: { id: true, fileUrl: true, title: true, category: true, fileName: true, fileSize: true, mimeType: true, visibleToCustomer: true, uploadedBy: true, uploadedAt: true, versionOfId: true, isCurrent: true },
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

  await prisma.$transaction(async (tx) => {
    const rootId = doc.versionOfId ?? doc.id;
    // Lấy các bản còn lại TRƯỚC khi xoá (FK version_of_id SET NULL sẽ cắt chuỗi khi xoá bản gốc).
    const rest = await tx.projectDocument.findMany({
      where: { OR: [{ id: rootId }, { versionOfId: rootId }], NOT: { id: doc.id } },
      orderBy: { versionNo: "asc" },
      select: { id: true, isCurrent: true, accessMode: true, fileName: true, designStep: true, visibleToCustomer: true, group: { select: { permCustomer: true } } },
    });
    await tx.projectDocument.delete({ where: { id: params.docId } });
    if (rest.length === 0) return;
    // Xoá bản gốc → bản cũ nhất còn lại làm gốc mới.
    if (rootId === doc.id) {
      const newRoot = rest[0];
      await tx.projectDocument.update({ where: { id: newRoot.id }, data: { versionOfId: null } });
      await tx.projectDocument.updateMany({ where: { id: { in: rest.slice(1).map((r) => r.id) } }, data: { versionOfId: newRoot.id } });
    }
    // Xoá bản hiện hành → bản mới nhất còn lại thành hiện hành.
    if (doc.isCurrent) {
      const latest = rest[rest.length - 1];
      const visible = latest.designStep
        ? true
        : latest.accessMode === "group"
          ? customerVisibleByGroup(latest.group, latest.fileName)
          : doc.visibleToCustomer;
      await tx.projectDocument.update({
        where: { id: latest.id },
        data: { isCurrent: true, visibleToCustomer: visible && !isCadFile(latest.fileName) },
      });
    }
  });

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
