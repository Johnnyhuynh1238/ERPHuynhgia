import { NextResponse } from "next/server";
import { TaskActivityType, TaskLogType, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canUpdateQc, getTaskWithAccess } from "@/lib/task-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";

type StoredQcPhoto = {
  id?: string;
  photoUrl: string;
  thumbnailUrl?: string;
};

const storedPhotoSchema = z.object({
  id: z.string().optional(),
  photoUrl: z.string().trim().min(1),
  thumbnailUrl: z.string().trim().optional(),
});

const saveResultSchema = z.object({
  isPassed: z.boolean(),
  photoUrl: z.string().trim().optional(),
  photos: z.array(storedPhotoSchema).optional(),
  note: z.string().optional(),
});

const LOCKED_STATUSES = new Set<TaskStatus>([TaskStatus.done, TaskStatus.internal_approved, TaskStatus.completed]);

function parseStoredPhotos(value: string | null): StoredQcPhoto[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed?.photos)) {
      return parsed.photos
        .map((photo: Partial<StoredQcPhoto>) => ({
          id: typeof photo.id === "string" ? photo.id : undefined,
          photoUrl: typeof photo.photoUrl === "string" ? photo.photoUrl : "",
          thumbnailUrl: typeof photo.thumbnailUrl === "string" ? photo.thumbnailUrl : undefined,
        }))
        .filter((photo: StoredQcPhoto) => Boolean(photo.photoUrl));
    }
  } catch {}
  return [{ photoUrl: value }];
}

function serializeStoredPhotos(photos: StoredQcPhoto[]) {
  if (!photos.length) return null;
  return JSON.stringify({ photos });
}

export async function POST(request: Request, { params }: { params: { id: string; itemId: string } }) {
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
    return NextResponse.json({ message: "Không có quyền cập nhật QC" }, { status: 403 });
  }

  const taskDetail = await prisma.task.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      templateId: true,
      status: true,
    },
  });

  if (!taskDetail) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }

  if (LOCKED_STATUSES.has(taskDetail.status)) {
    return NextResponse.json({ message: "Task đã hoàn tất, không thể cập nhật QC" }, { status: 400 });
  }

  if (!taskDetail.templateId) {
    return NextResponse.json({ message: "Task tùy ý không có checklist QC mẫu" }, { status: 400 });
  }

  const item = await prisma.qcChecklistItem.findFirst({
    where: {
      id: params.itemId,
      template: {
        taskTemplateId: taskDetail.templateId,
      },
    },
    select: {
      id: true,
      title: true,
      requirePhoto: true,
    },
  });

  if (!item) {
    return NextResponse.json({ message: "Không tìm thấy tiêu chí QC" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = saveResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const previous = await prisma.taskQcResult.findUnique({
    where: {
      taskId_itemId: {
        taskId: params.id,
        itemId: item.id,
      },
    },
    select: {
      id: true,
      isPassed: true,
      passedAtFirstAttempt: true,
      photoUrl: true,
      note: true,
    },
  });

  const submittedPhotos = parsed.data.photos?.filter((photo) => photo.photoUrl) || [];
  const previousPhotos = parseStoredPhotos(previous?.photoUrl || null);
  const photos = submittedPhotos.length
    ? submittedPhotos
    : parsed.data.photoUrl
      ? [{ photoUrl: parsed.data.photoUrl }]
      : previousPhotos;
  const firstPhotoUrl = photos[0]?.photoUrl || "";
  const note = String(parsed.data.note || "").trim();

  if (parsed.data.isPassed && item.requirePhoto && !photos.length) {
    return NextResponse.json({ message: "Tiêu chí này bắt buộc ảnh minh chứng" }, { status: 400 });
  }

  const now = new Date();
  const passedAtFirstAttempt = !previous
    ? parsed.data.isPassed
    : previous.passedAtFirstAttempt === false
      ? false
      : parsed.data.isPassed
        ? previous.passedAtFirstAttempt ?? (previous.isPassed ? null : false)
        : false;

  const result = await prisma.$transaction(async (tx) => {
    const saved = await tx.taskQcResult.upsert({
      where: {
        taskId_itemId: {
          taskId: params.id,
          itemId: item.id,
        },
      },
      create: {
        taskId: params.id,
        itemId: item.id,
        isPassed: parsed.data.isPassed,
        passedAtFirstAttempt,
        photoUrl: serializeStoredPhotos(photos),
        note: note || null,
        checkedBy: user.id,
        checkedAt: now,
      },
      update: {
        isPassed: parsed.data.isPassed,
        passedAtFirstAttempt,
        photoUrl: serializeStoredPhotos(photos),
        note: note || null,
        checkedBy: user.id,
        checkedAt: now,
      },
      include: {
        checker: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    const [totalItems, passedItems] = await Promise.all([
      tx.qcChecklistItem.count({
        where: {
          template: {
            taskTemplateId: taskDetail.templateId!,
          },
        },
      }),
      tx.taskQcResult.count({
        where: {
          taskId: params.id,
          isPassed: true,
        },
      }),
    ]);

    const isQcCompleted = totalItems > 0 && passedItems === totalItems;

    await tx.task.update({
      where: { id: params.id },
      data: {
        qcCompletedAt: isQcCompleted ? now : null,
      },
    });

    await tx.taskActivityLog.create({
      data: {
        taskId: params.id,
        userId: user.id,
        type: parsed.data.isPassed ? TaskActivityType.qc_item_checked : TaskActivityType.qc_item_unchecked,
        fromValue: previous ? (previous.isPassed ? "passed" : "unchecked") : "unchecked",
        toValue: parsed.data.isPassed ? "passed" : "unchecked",
        metadata: {
          itemId: item.id,
          itemTitle: item.title,
          photoUrl: firstPhotoUrl || null,
          photos,
          note: note || null,
        },
        description: `${parsed.data.isPassed ? "Đạt" : "Bỏ đạt"} tiêu chí QC: ${item.title}`,
      },
    });

    await tx.taskLog.create({
      data: {
        taskId: params.id,
        userId: user.id,
        logType: TaskLogType.note,
        oldValue: previous ? String(previous.isPassed) : null,
        newValue: String(parsed.data.isPassed),
        content: `${parsed.data.isPassed ? "QC_PASS" : "QC_UNPASS"}: ${item.title}`,
      },
    });

    const meta = await tx.task.findUnique({ where: { id: params.id }, select: { code: true, name: true } });
    await logProjectActivity(tx, {
      projectId: task.projectId,
      actorId: user.id,
      entity: "task_qc_result",
      entityId: saved.id,
      action: parsed.data.isPassed ? "qc_pass" : "qc_unpass",
      summary: `${parsed.data.isPassed ? "Đạt" : "Bỏ đạt"} tiêu chí QC "${item.title}" task ${meta?.code} "${meta?.name}"`,
      metadata: {
        taskId: params.id,
        itemId: item.id,
        itemTitle: item.title,
        previousPassed: previous?.isPassed ?? null,
        passedAtFirstAttempt,
        photoCount: photos.length,
        noteLength: note.length,
        qcCompleted: isQcCompleted,
      },
    });

    return {
      saved,
      summary: {
        total: totalItems,
        passed: passedItems,
        remaining: Math.max(totalItems - passedItems, 0),
        completed: isQcCompleted,
      },
    };
  });

  return NextResponse.json({
    message: "Đã lưu kết quả QC",
    result: {
      id: result.saved.id,
      itemId: result.saved.itemId,
      isPassed: result.saved.isPassed,
      passedAtFirstAttempt: result.saved.passedAtFirstAttempt,
      photoUrl: firstPhotoUrl || null,
      photos,
      note: result.saved.note,
      checkedAt: result.saved.checkedAt,
      updatedAt: result.saved.updatedAt,
      checkedBy: result.saved.checker,
    },
    summary: result.summary,
  });
}
