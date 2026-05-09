import { AssignmentPriority, DailyAssignmentStatus, DailyAssignmentType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { getTodayDateVn } from "@/lib/task-centric";

export function getReportDateVn() {
  return getTodayDateVn();
}

export function getSubmissionDeadline(reportDate: Date) {
  const d = new Date(reportDate);
  d.setUTCHours(11, 0, 0, 0);
  return d;
}

export function isAfterSubmissionDeadline(now: Date, reportDate: Date) {
  return now.getTime() > getSubmissionDeadline(reportDate).getTime();
}

export function isPastEndOfDayVn(now: Date, reportDate: Date) {
  const eod = new Date(reportDate);
  eod.setUTCHours(16, 59, 59, 999);
  return now.getTime() > eod.getTime();
}

export function sortFlatAssignments<T extends { status: DailyAssignmentStatus; priority?: AssignmentPriority | null; doneAt?: Date | null; dueAt?: Date | null }>(
  assignments: T[],
) {
  const statusOrder: Record<DailyAssignmentStatus, number> = {
    pending: 0,
    not_applicable: 1,
    done: 2,
  };

  const priorityOrder: Record<AssignmentPriority, number> = {
    critical: 0,
    urgent: 1,
    important: 2,
    normal: 3,
  };

  return [...assignments].sort((a, b) => {
    const sA = statusOrder[a.status];
    const sB = statusOrder[b.status];
    if (sA !== sB) return sA - sB;

    const pA = priorityOrder[a.priority || "normal"];
    const pB = priorityOrder[b.priority || "normal"];
    if (pA !== pB) return pA - pB;

    if (a.dueAt && b.dueAt) {
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    }

    if (a.doneAt && b.doneAt) {
      return new Date(a.doneAt).getTime() - new Date(b.doneAt).getTime();
    }

    return 0;
  });
}

export async function generateAssignmentsAfterCheckin({
  ksUserId,
  reportDate,
  taskIds,
}: {
  ksUserId: string;
  reportDate: Date;
  taskIds: string[];
}) {
  if (!taskIds.length) return { created: 0 };

  const tasks = await prisma.task.findMany({
    where: {
      id: { in: taskIds },
      assignedEngineerId: ksUserId,
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      template: {
        select: {
          assignmentItems: {
            orderBy: { displayOrder: "asc" },
            select: {
              id: true,
              title: true,
              guideContent: true,
              requirePhoto: true,
            },
          },
        },
      },
    },
  });

  const existing = await prisma.taskDailyAssignment.findMany({
    where: {
      ksUserId,
      reportDate,
      taskId: { in: tasks.map((task) => task.id) },
    },
    select: {
      taskId: true,
      type: true,
      templateItemId: true,
    },
  });

  const existingTemplateKey = new Set(
    existing
      .filter((row) => row.type === DailyAssignmentType.template_item && row.taskId && row.templateItemId)
      .map((row) => `${row.taskId}:${row.templateItemId}`),
  );
  const existingProgressTaskIds = new Set(
    existing.filter((row) => row.type === DailyAssignmentType.progress_update && row.taskId).map((row) => row.taskId as string),
  );

  const batch: Array<{
    ksUserId: string;
    reportDate: Date;
    taskId?: string;
    type: DailyAssignmentType;
    templateItemId?: string;
    title: string;
    guideContent?: string | null;
    requirePhoto?: boolean;
    priority?: AssignmentPriority;
  }> = [];

  for (const task of tasks) {
    const templateItems = task.template?.assignmentItems || [];

    for (const item of templateItems) {
      const key = `${task.id}:${item.id}`;
      if (existingTemplateKey.has(key)) continue;
      batch.push({
        ksUserId,
        reportDate,
        taskId: task.id,
        type: DailyAssignmentType.template_item,
        templateItemId: item.id,
        title: item.title,
        guideContent: item.guideContent,
        requirePhoto: item.requirePhoto,
        priority: AssignmentPriority.normal,
      });
    }

    if (!existingProgressTaskIds.has(task.id)) {
      batch.push({
        ksUserId,
        reportDate,
        taskId: task.id,
        type: DailyAssignmentType.progress_update,
        title: `Update tiến độ ${task.code}`,
        requirePhoto: true,
        priority: AssignmentPriority.important,
      });
    }
  }

  if (!batch.length) return { created: 0 };

  await prisma.taskDailyAssignment.createMany({
    data: batch,
  });

  return { created: batch.length };
}

export async function upsertPendingTptcAssignmentsForDay({
  ksUserId,
  reportDate,
  selectedIds,
}: {
  ksUserId: string;
  reportDate: Date;
  selectedIds?: string[];
}) {
  const eod = new Date(reportDate);
  eod.setUTCHours(16, 59, 59, 999);

  const pending = await prisma.tptcAssignment.findMany({
    where: {
      assignedToUserId: ksUserId,
      status: "pending",
      dueAt: { lte: eod },
      project: buildProjectAccessWhere({ id: ksUserId, role: UserRole.engineer }),
      ...(selectedIds && selectedIds.length ? { id: { in: selectedIds } } : {}),
    },
    select: {
      id: true,
      title: true,
      priority: true,
    },
  });

  if (!pending.length) return { created: 0 };

  const existing = await prisma.taskDailyAssignment.findMany({
    where: {
      ksUserId,
      reportDate,
      type: DailyAssignmentType.tptc_assignment,
      tptcAssignmentId: { in: pending.map((item) => item.id) },
    },
    select: { tptcAssignmentId: true },
  });

  const existingSet = new Set(existing.map((item) => item.tptcAssignmentId).filter(Boolean) as string[]);

  const batch = pending
    .filter((item) => !existingSet.has(item.id))
    .map((item) => ({
      ksUserId,
      reportDate,
      tptcAssignmentId: item.id,
      type: DailyAssignmentType.tptc_assignment,
      title: item.title,
      priority: item.priority,
      requirePhoto: false,
    }));

  if (!batch.length) return { created: 0 };

  await prisma.taskDailyAssignment.createMany({ data: batch });

  return { created: batch.length };
}
