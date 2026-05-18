import { NextResponse } from "next/server";
import { TaskActivityType, TaskLogType, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { fireAndForget, notifyKsTaskUpdate } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { canUpdateQc, getTaskWithAccess } from "@/lib/task-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";

const progressPhotoSchema = z.object({
  id: z.string().optional(),
  photoUrl: z.string().trim().min(1),
  thumbnailUrl: z.string().trim().optional(),
});

const createProgressSchema = z.object({
  progressPercent: z.number().int().min(0).max(100),
  photoUrl: z.string().trim().min(1, "Ảnh tiến độ là bắt buộc"),
  photos: z.array(progressPhotoSchema).max(20).optional(),
  reason: z.string().optional(),
  note: z.string().optional(),
});

function serializeProgressPhotos(input: z.infer<typeof createProgressSchema>) {
  const photos = [...(input.photos || [])];
  if (!photos.some((photo) => photo.photoUrl === input.photoUrl)) {
    photos.unshift({ photoUrl: input.photoUrl });
  }

  const uniquePhotos = photos.filter((photo, index, list) => list.findIndex((item) => item.photoUrl === photo.photoUrl) === index);
  if (uniquePhotos.length <= 1) return input.photoUrl;
  return JSON.stringify({ photos: uniquePhotos });
}

function publicPhotoUrls(taskId: string, photoId: string) {
  return {
    id: photoId,
    photoUrl: `/api/tasks/${taskId}/photos/${photoId}/file?variant=photo`,
    thumbnailUrl: `/api/tasks/${taskId}/photos/${photoId}/file?variant=thumb`,
  };
}

function extractTaskPhotoId(value: string) {
  const match = value.match(/\/photos\/([^/]+)\/file/);
  return match?.[1] || null;
}

function hasProgressPhotoAlbum(value: string) {
  try {
    const parsed = JSON.parse(value) as { photos?: unknown[] };
    return Array.isArray(parsed.photos) && parsed.photos.length > 1;
  } catch {
    return false;
  }
}

const LOCKED_STATUSES = new Set<TaskStatus>([TaskStatus.done, TaskStatus.internal_approved, TaskStatus.completed]);

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const [taskDetail, history, taskPhotos] = await Promise.all([
    prisma.task.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        progressPercent: true,
        progressUpdatedAt: true,
        status: true,
      },
    }),
    prisma.taskProgressHistory.findMany({
      where: { taskId: params.id },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    }),
    prisma.taskPhoto.findMany({
      where: { taskId: params.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        uploadedBy: true,
        createdAt: true,
      },
    }),
  ]);

  const historyWithAlbums = history.map((row) => {
    if (hasProgressPhotoAlbum(row.photoUrl)) return row;

    const selectedPhotoId = extractTaskPhotoId(row.photoUrl);
    const selectedPhoto = selectedPhotoId ? taskPhotos.find((photo) => photo.id === selectedPhotoId) : null;
    if (!selectedPhoto) return row;

    const batchStart = new Date(row.createdAt.getTime() - 5 * 60 * 1000);
    const batchPhotos = taskPhotos.filter(
      (photo) =>
        photo.uploadedBy === row.userId &&
        photo.createdAt >= batchStart &&
        photo.createdAt <= row.createdAt &&
        Math.abs(photo.createdAt.getTime() - selectedPhoto.createdAt.getTime()) <= 5 * 60 * 1000,
    );

    if (batchPhotos.length <= 1) return row;
    return {
      ...row,
      photoUrl: JSON.stringify({ photos: batchPhotos.map((photo) => publicPhotoUrls(params.id, photo.id)) }),
    };
  });

  return NextResponse.json({
    progress: {
      percent: taskDetail?.progressPercent ?? 0,
      updatedAt: taskDetail?.progressUpdatedAt ?? null,
      status: taskDetail?.status ?? null,
    },
    history: historyWithAlbums,
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (!canUpdateQc(task, { id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền cập nhật tiến độ" }, { status: 403 });
  }

  const taskDetail = await prisma.task.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      progressPercent: true,
      status: true,
    },
  });

  if (!taskDetail) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }

  if (LOCKED_STATUSES.has(taskDetail.status)) {
    return NextResponse.json({ message: "Task đã hoàn tất, không thể cập nhật tiến độ" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createProgressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const reason = String(parsed.data.reason || "").trim();
  const note = String(parsed.data.note || "").trim();
  const storedPhotoUrl = serializeProgressPhotos(parsed.data);

  if (parsed.data.progressPercent < taskDetail.progressPercent && !reason) {
    return NextResponse.json({ message: "Giảm tiến độ bắt buộc nhập lý do" }, { status: 400 });
  }

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const updatedTask = await tx.task.update({
      where: { id: params.id },
      data: {
        progressPercent: parsed.data.progressPercent,
        progressUpdatedAt: now,
      },
      select: {
        id: true,
        progressPercent: true,
        progressUpdatedAt: true,
        status: true,
      },
    });

    const history = await tx.taskProgressHistory.create({
      data: {
        taskId: params.id,
        userId: user.id,
        fromPercent: taskDetail.progressPercent,
        toPercent: parsed.data.progressPercent,
        photoUrl: storedPhotoUrl,
        reason: reason || null,
        note: note || null,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    await tx.taskActivityLog.create({
      data: {
        taskId: params.id,
        userId: user.id,
        type: TaskActivityType.progress_updated,
        fromValue: String(taskDetail.progressPercent),
        toValue: String(parsed.data.progressPercent),
        metadata: {
          photoUrl: storedPhotoUrl,
          photos: parsed.data.photos || null,
          reason: reason || null,
          note: note || null,
        },
        description: `Cập nhật tiến độ ${taskDetail.progressPercent}% -> ${parsed.data.progressPercent}%`,
      },
    });

    await tx.taskLog.create({
      data: {
        taskId: params.id,
        userId: user.id,
        logType: TaskLogType.note,
        oldValue: String(taskDetail.progressPercent),
        newValue: String(parsed.data.progressPercent),
        content: `PROGRESS_UPDATE: ${taskDetail.progressPercent}% -> ${parsed.data.progressPercent}%`,
      },
    });

    await logProjectActivity(tx, {
      projectId: task.projectId,
      actorId: user.id,
      entity: "task",
      entityId: params.id,
      action: "update_progress",
      summary: `Cập nhật tiến độ task ${task.code} "${taskDetail.name}": ${taskDetail.progressPercent}% → ${parsed.data.progressPercent}%${reason ? ` (${reason})` : ""}`,
      diff: { progressPercent: { from: taskDetail.progressPercent, to: parsed.data.progressPercent } },
      metadata: { reason: reason || null, note: note || null, photoCount: parsed.data.photos?.length ?? 1 },
    });

    return { updatedTask, history };
  });

  fireAndForget(
    notifyKsTaskUpdate({
      projectId: task.projectId,
      taskId: task.id,
      actorUserId: user.id,
      actorName: user.name ?? "Người dùng",
      changeKind: "progress",
      taskName: taskDetail.name,
      taskVisibleToCustomer: Boolean((task as { visibleToCustomer?: boolean }).visibleToCustomer),
      detail: `${taskDetail.progressPercent}% → ${parsed.data.progressPercent}%`,
    }),
  );

  return NextResponse.json({
    message: "Đã cập nhật tiến độ",
    progress: {
      percent: result.updatedTask.progressPercent,
      updatedAt: result.updatedTask.progressUpdatedAt,
      status: result.updatedTask.status,
    },
    history: result.history,
  });
}
