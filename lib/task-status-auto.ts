import { TaskLogType, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = any;

type RecomputeOptions = {
  db?: DbClient;
  actorUserId?: string;
  forceInProgress?: boolean;
  statusDate?: Date;
};

export async function recomputeTaskStatus(taskId: string, reason: string, options: RecomputeOptions = {}) {
  const db = options.db ?? prisma;

  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      actualStartDate: true,
    },
  });

  if (!task) return null;

  if (task.status === TaskStatus.na || task.status === TaskStatus.inspected || task.status === TaskStatus.delayed) {
    return task;
  }

  if (options.forceInProgress && task.status === TaskStatus.not_started) {
    const nextActualStart = task.actualStartDate ?? options.statusDate ?? new Date();

    const updated = await db.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatus.in_progress,
        actualStartDate: nextActualStart,
      },
    });

    if (options.actorUserId) {
      await db.taskLog.create({
        data: {
          taskId: task.id,
          userId: options.actorUserId,
          logType: TaskLogType.status_change,
          oldValue: task.status,
          newValue: TaskStatus.in_progress,
          content: `AUTO_STATUS: ${task.status} -> ${TaskStatus.in_progress} (${reason})`,
        },
      });
    }

    return updated;
  }

  return task;
}

export async function setTaskInspected(taskId: string, actorUserId: string, reason: string, options: { db?: DbClient } = {}) {
  const db = options.db ?? prisma;
  const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true, status: true } });
  if (!task) return null;
  if (task.status === TaskStatus.inspected || task.status === TaskStatus.na) return task;

  const updated = await db.task.update({
    where: { id: taskId },
    data: {
      status: TaskStatus.inspected,
      actualEndDate: new Date(),
    },
  });

  await db.taskLog.create({
    data: {
      taskId,
      userId: actorUserId,
      logType: TaskLogType.status_change,
      oldValue: task.status,
      newValue: TaskStatus.inspected,
      content: `AUTO_STATUS: ${task.status} -> ${TaskStatus.inspected} (${reason})`,
    },
  });

  return updated;
}

export async function applyOverdueStatus(now: Date, options: { db?: DbClient; actorUserId?: string } = {}) {
  const db = options.db ?? prisma;
  const tasks = await db.task.findMany({
    where: {
      isActive: true,
      plannedEndDate: { lt: now },
      status: { in: [TaskStatus.in_progress] },
    },
    select: { id: true, status: true },
  });

  let changed = 0;
  for (const task of tasks) {
    await db.task.update({ where: { id: task.id }, data: { status: TaskStatus.delayed } });
    if (options.actorUserId) {
      await db.taskLog.create({
        data: {
          taskId: task.id,
          userId: options.actorUserId,
          logType: TaskLogType.status_change,
          oldValue: task.status,
          newValue: TaskStatus.delayed,
          content: `AUTO_STATUS: ${task.status} -> ${TaskStatus.delayed} (overdue plannedEndDate)`,
        },
      });
    }
    changed += 1;
  }

  return { scanned: tasks.length, changed };
}
