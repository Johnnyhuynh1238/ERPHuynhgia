import { AssignmentPriority, DailyAssignmentStatus, DailyAssignmentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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

function parseGuideLines(content?: string | null) {
  if (!content) return [] as string[];
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean);
}

function buildFallbackAssignmentItemsFromLegacyGuides(template?: {
  qcTemplate?: {
    guidePreparation?: string | null;
    guideExecution?: string | null;
    guideMistakes?: string | null;
    guideBeforeQc?: string | null;
  } | null;
}) {
  if (!template?.qcTemplate) return [] as Array<{ title: string; guideContent: string | null; requirePhoto: boolean }>;

  const sections: Array<{ heading: string; content?: string | null }> = [
    { heading: "Chuẩn bị", content: template.qcTemplate.guidePreparation },
    { heading: "Thi công", content: template.qcTemplate.guideExecution },
    { heading: "Sai sót thường gặp", content: template.qcTemplate.guideMistakes },
    { heading: "Trước khi mời QC", content: template.qcTemplate.guideBeforeQc },
  ];

  const rows: Array<{ title: string; guideContent: string | null; requirePhoto: boolean }> = [];
  for (const section of sections) {
    for (const line of parseGuideLines(section.content)) {
      rows.push({
        title: line,
        guideContent: `${section.heading}\n${line}`,
        requirePhoto: true,
      });
    }
  }

  return rows;
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
      templateId: true,
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
          qcTemplate: {
            select: {
              guidePreparation: true,
              guideExecution: true,
              guideMistakes: true,
              guideBeforeQc: true,
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

    if (templateItems.length > 0) {
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
    } else {
      const fallbackItems = buildFallbackAssignmentItemsFromLegacyGuides(task.template);
      for (const item of fallbackItems) {
        batch.push({
          ksUserId,
          reportDate,
          taskId: task.id,
          type: DailyAssignmentType.template_item,
          title: item.title,
          guideContent: item.guideContent,
          requirePhoto: item.requirePhoto,
          priority: AssignmentPriority.normal,
        });
      }
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
