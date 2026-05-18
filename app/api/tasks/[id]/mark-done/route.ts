import { NextResponse } from "next/server";
import { TaskActivityType, TaskLogType, TaskStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { syncPhaseStatusByTaskId } from "@/lib/project-phase";
import { canUpdateQc, getTaskWithAccess } from "@/lib/task-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
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
    return NextResponse.json({ message: "Không có quyền hoàn thành task" }, { status: 403 });
  }

  const taskDetail = await prisma.task.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      origin: true,
      templateId: true,
      progressPercent: true,
      status: true,
      actualStartDate: true,
      actualEndDate: true,
    },
  });

  if (!taskDetail) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }

  if (
    taskDetail.status === TaskStatus.done ||
    taskDetail.status === TaskStatus.internal_approved ||
    taskDetail.status === TaskStatus.completed
  ) {
    return NextResponse.json({ message: "Task đã ở trạng thái hoàn tất" }, { status: 400 });
  }

  if (taskDetail.progressPercent !== 100) {
    return NextResponse.json({ message: "Chỉ được hoàn thành khi tiến độ đạt 100%" }, { status: 400 });
  }

  if (taskDetail.origin === "template") {
    if (!taskDetail.templateId) {
      return NextResponse.json({ message: "Task template thiếu liên kết mẫu" }, { status: 400 });
    }

    const [templateItems, results] = await Promise.all([
      prisma.qcChecklistItem.findMany({
        where: {
          template: {
            taskTemplateId: taskDetail.templateId,
          },
        },
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          title: true,
          requirePhoto: true,
        },
      }),
      prisma.taskQcResult.findMany({
        where: { taskId: params.id },
        select: {
          itemId: true,
          isPassed: true,
          photoUrl: true,
        },
      }),
    ]);

    if (templateItems.length === 0) {
      return NextResponse.json({ message: "Task template chưa có checklist QC" }, { status: 400 });
    }

    const resultMap = new Map(results.map((result) => [result.itemId, result]));

    const missingItems = templateItems.filter((item) => !resultMap.get(item.id)?.isPassed);
    if (missingItems.length > 0) {
      return NextResponse.json(
        {
          message: "Checklist QC chưa hoàn tất",
          missingItems: missingItems.map((item) => ({ id: item.id, title: item.title })),
        },
        { status: 400 },
      );
    }

    const missingPhotos = templateItems.filter((item) => {
      if (!item.requirePhoto) return false;
      const result = resultMap.get(item.id);
      return !result?.photoUrl;
    });

    if (missingPhotos.length > 0) {
      return NextResponse.json(
        {
          message: "Một số tiêu chí bắt buộc ảnh nhưng chưa có minh chứng",
          missingPhotos: missingPhotos.map((item) => ({ id: item.id, title: item.title })),
        },
        { status: 400 },
      );
    }
  }

  if (taskDetail.origin === "custom") {
    const progressEvidence = await prisma.taskProgressHistory.count({
      where: {
        taskId: params.id,
      },
    });

    if (progressEvidence < 1) {
      return NextResponse.json({ message: "Task tùy ý cần ít nhất 1 cập nhật tiến độ có ảnh" }, { status: 400 });
    }
  }

  const now = new Date();

  const updatedTask = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: params.id },
      data: {
        status: TaskStatus.done,
        qcCompletedAt: now,
        actualStartDate: taskDetail.actualStartDate || now,
        actualEndDate: taskDetail.actualEndDate || now,
      },
    });

    await tx.taskActivityLog.create({
      data: {
        taskId: params.id,
        userId: user.id,
        type: TaskActivityType.qc_completed,
        fromValue: taskDetail.status,
        toValue: TaskStatus.done,
        metadata: {
          origin: taskDetail.origin,
          progressPercent: taskDetail.progressPercent,
        },
        description: "KS đánh dấu hoàn thành task",
      },
    });

    await tx.taskLog.create({
      data: {
        taskId: params.id,
        userId: user.id,
        logType: TaskLogType.status_change,
        oldValue: taskDetail.status,
        newValue: TaskStatus.done,
        content: `MARK_DONE: ${taskDetail.status} -> ${TaskStatus.done}`,
      },
    });

    await syncPhaseStatusByTaskId(tx, params.id, now);

    await logProjectActivity(tx, {
      projectId: task.projectId,
      actorId: user.id,
      entity: "task",
      entityId: params.id,
      action: "mark_done",
      summary: `KS đánh dấu hoàn thành task ${task.code} "${taskDetail.name}"`,
      diff: { status: { from: taskDetail.status, to: TaskStatus.done } },
      metadata: { origin: taskDetail.origin, progressPercent: taskDetail.progressPercent },
    });

    return updated;
  });

  return NextResponse.json({
    message: "Đã chuyển task sang Hoàn thành",
    task: updatedTask,
  });
}
