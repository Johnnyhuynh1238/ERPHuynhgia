import { NextResponse } from "next/server";
import { QcItemStatus, QcLogAction, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTaskWithAccess } from "@/lib/task-permissions";
import { buildDiff, joinSummary, logProjectActivity } from "@/lib/project-activity-log";

const patchSchema = z.object({
  status: z.nativeEnum(QcItemStatus).optional(),
  note: z.string().optional(),
  noPhotoReason: z.boolean().optional(),
  content: z.string().trim().min(1).optional(),
  requirePhoto: z.boolean().optional(),
  requireNote: z.boolean().optional(),
});

async function isEngineerMemberOfProject(projectId: string, userId: string) {
  const member = await prisma.projectMember.findFirst({
    where: {
      projectId,
      userId,
      roleInProject: "engineer",
    },
    select: { id: true },
  });
  return Boolean(member);
}

async function canEditQcItemMeta(role: string, projectId: string, userId: string) {
  if (role === UserRole.admin || role === UserRole.construction_manager) return true;
  if (role !== UserRole.engineer) return false;
  return isEngineerMemberOfProject(projectId, userId);
}

async function canUpdateQcProgress(role: string, projectId: string, userId: string) {
  if (role === UserRole.admin || role === UserRole.construction_manager) return true;
  if (role !== UserRole.engineer) return false;
  return isEngineerMemberOfProject(projectId, userId);
}

export async function PATCH(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const item = await prisma.qcItem.findFirst({
    where: { id: params.itemId, taskId: params.id },
    include: {
      progress: true,
      photos: { select: { id: true } },
    },
  });

  if (!item) {
    return NextResponse.json({ message: "Không tìm thấy mục QC" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;

  const wantsMetaEdit = payload.content !== undefined || payload.requirePhoto !== undefined || payload.requireNote !== undefined;
  const wantsProgressEdit = payload.status !== undefined || payload.note !== undefined || payload.noPhotoReason !== undefined;

  if (wantsMetaEdit) {
    const canEditMeta = await canEditQcItemMeta(user.role, task.projectId, user.id);
    if (!canEditMeta) {
      return NextResponse.json({ message: "Không có quyền sửa nội dung mục QC" }, { status: 403 });
    }
  }

  if (wantsProgressEdit) {
    const canEditProgress = await canUpdateQcProgress(user.role, task.projectId, user.id);
    if (!canEditProgress) {
      return NextResponse.json({ message: "Không có quyền cập nhật trạng thái QC" }, { status: 403 });
    }
  }

  const nextStatus = payload.status ?? item.progress?.status ?? QcItemStatus.unchecked;
  const nextNote = payload.note ?? item.progress?.note ?? null;
  const nextNoPhotoReason = payload.noPhotoReason ?? item.progress?.noPhotoReason ?? false;

  if (payload.status === QcItemStatus.passed) {
    if (item.requirePhoto && item.photos.length === 0 && !nextNoPhotoReason) {
      return NextResponse.json({ message: "Cần upload ảnh trước hoặc tick 'không có ảnh'" }, { status: 400 });
    }
    if (item.requireNote && !String(nextNote || "").trim()) {
      return NextResponse.json({ message: "Cần nhập ghi chú trước khi tick Đạt" }, { status: 400 });
    }
  }

  if (payload.status === QcItemStatus.failed && String(nextNote || "").trim().length < 10) {
    return NextResponse.json({ message: "Khi Không đạt phải nhập lý do tối thiểu 10 ký tự" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedItem =
      payload.content !== undefined || payload.requirePhoto !== undefined || payload.requireNote !== undefined
        ? await tx.qcItem.update({
            where: { id: item.id },
            data: {
              content: payload.content ?? item.content,
              requirePhoto: payload.requirePhoto ?? item.requirePhoto,
              requireNote: payload.requireNote ?? item.requireNote,
            },
          })
        : item;

    const progress = await tx.qcProgress.upsert({
      where: { qcItemId: item.id },
      create: {
        qcItemId: item.id,
        taskId: params.id,
        status: nextStatus,
        note: nextNote,
        noPhotoReason: nextNoPhotoReason,
        updatedBy: user.id,
      },
      update: {
        status: nextStatus,
        note: nextNote,
        noPhotoReason: nextNoPhotoReason,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    if (payload.status !== undefined && payload.status !== (item.progress?.status ?? QcItemStatus.unchecked)) {
      await tx.qcLog.create({
        data: {
          taskId: params.id,
          qcItemId: item.id,
          action: QcLogAction.status_changed,
          fromStatus: item.progress?.status ?? QcItemStatus.unchecked,
          toStatus: payload.status,
          note: String(nextNote || "").trim() || null,
          performedBy: user.id,
        },
      });
    } else if (payload.note !== undefined) {
      await tx.qcLog.create({
        data: {
          taskId: params.id,
          qcItemId: item.id,
          action: QcLogAction.note_updated,
          note: String(nextNote || "").trim() || null,
          performedBy: user.id,
        },
      });
    }

    const metaDiff = buildDiff(item as any, updatedItem as any, [
      ["content", "Nội dung"],
      ["requirePhoto", "Bắt buộc ảnh"],
      ["requireNote", "Bắt buộc ghi chú"],
    ]);

    const prevStatus = item.progress?.status ?? QcItemStatus.unchecked;
    const statusChanged = payload.status !== undefined && payload.status !== prevStatus;

    if (metaDiff.lines.length > 0) {
      await logProjectActivity(tx, {
        projectId: task.projectId,
        actorId: user.id,
        entity: "task_qc_item",
        entityId: item.id,
        action: "update",
        summary: joinSummary(`Sửa mục QC "${item.content}" task ${task.code}`, metaDiff.lines, "Sửa mục QC"),
        diff: metaDiff.diff,
      });
    }

    if (statusChanged) {
      await logProjectActivity(tx, {
        projectId: task.projectId,
        actorId: user.id,
        entity: "task_qc_item",
        entityId: item.id,
        action: "update_status",
        summary: `QC "${item.content}" task ${task.code}: ${prevStatus} → ${payload.status}`,
        diff: { status: { from: prevStatus, to: payload.status } },
        metadata: { note: String(nextNote || "").trim() || null },
      });
    }

    return { updatedItem, progress };
  });

  return NextResponse.json({
    item: {
      ...updated.updatedItem,
      progress: updated.progress,
    },
    message: "Đã cập nhật mục QC",
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string; itemId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const canDelete = await canEditQcItemMeta(user.role, task.projectId, user.id);
  if (!canDelete) {
    return NextResponse.json({ message: "Không có quyền xóa mục QC" }, { status: 403 });
  }

  const item = await prisma.qcItem.findFirst({
    where: { id: params.itemId, taskId: params.id },
    select: { id: true, content: true, requirePhoto: true, requireNote: true, orderIndex: true },
  });

  if (!item) {
    return NextResponse.json({ message: "Không tìm thấy mục QC" }, { status: 404 });
  }

  await prisma.qcItem.delete({ where: { id: item.id } });

  await logProjectActivity(prisma, {
    projectId: task.projectId,
    actorId: user.id,
    entity: "task_qc_item",
    entityId: item.id,
    action: "delete",
    summary: `Xóa mục QC "${item.content}" khỏi task ${task.code} "${task.name}"`,
    snapshot: { content: item.content, requirePhoto: item.requirePhoto, requireNote: item.requireNote, orderIndex: item.orderIndex },
  });

  return NextResponse.json({ message: "Đã xóa mục QC" });
}
