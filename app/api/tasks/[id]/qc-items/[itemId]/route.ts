import { NextResponse } from "next/server";
import { QcItemStatus, QcLogAction, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTaskWithAccess } from "@/lib/task-permissions";

const patchSchema = z.object({
  status: z.nativeEnum(QcItemStatus).optional(),
  note: z.string().optional(),
  noPhotoReason: z.boolean().optional(),
  content: z.string().trim().min(1).optional(),
  requirePhoto: z.boolean().optional(),
  requireNote: z.boolean().optional(),
});

function canEditQcItemMeta(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

function canUpdateQcProgress(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager || role === UserRole.engineer;
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

  if ((payload.content !== undefined || payload.requirePhoto !== undefined || payload.requireNote !== undefined) && !canEditQcItemMeta(user.role)) {
    return NextResponse.json({ message: "Không có quyền sửa nội dung mục QC" }, { status: 403 });
  }

  if ((payload.status !== undefined || payload.note !== undefined || payload.noPhotoReason !== undefined) && !canUpdateQcProgress(user.role)) {
    return NextResponse.json({ message: "Không có quyền cập nhật trạng thái QC" }, { status: 403 });
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

  if (!canEditQcItemMeta(user.role)) {
    return NextResponse.json({ message: "Không có quyền xóa mục QC" }, { status: 403 });
  }

  const item = await prisma.qcItem.findFirst({
    where: { id: params.itemId, taskId: params.id },
    select: { id: true },
  });

  if (!item) {
    return NextResponse.json({ message: "Không tìm thấy mục QC" }, { status: 404 });
  }

  await prisma.qcItem.delete({ where: { id: item.id } });
  return NextResponse.json({ message: "Đã xóa mục QC" });
}
