import { DailyRating, TaskLogType, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addUtcDays, formatUtcYmd, nowUtcDateOnly, toUtcStartOfDay } from "@/lib/date";
import { getActivityDates, getProjectSiteRestDates } from "@/lib/reporting";

export type KpiBreakdown = {
  morningOnTime: number;
  eveningOnTime: number;
  taskOnSchedule: number;
  dailyPlanMet: number;
  inspectionQuality: number;
  reportProactivity: number;
};

export type KpiDetail = {
  requiredDays: number;
  morningOnTimeDays: number;
  eveningOnTimeDays: number;
  totalCompletedTasks: number;
  onScheduleTasks: number;
  totalEvening: number;
  metOrOverCount: number;
  totalInspected: number;
  inspectedPassFirstTime: number;
  proactivityRaw: number;
};

export type KpiResult = {
  score: number;
  rank: string;
  weights: typeof WEIGHTS;
  breakdown: KpiBreakdown;
  detail: KpiDetail;
};

const WEIGHTS = {
  morningOnTime: 15,
  eveningOnTime: 15,
  taskOnSchedule: 25,
  dailyPlanMet: 20,
  inspectionQuality: 15,
  reportProactivity: 10,
} as const;

const EMPTY_BREAKDOWN: KpiBreakdown = {
  morningOnTime: 0,
  eveningOnTime: 0,
  taskOnSchedule: 0,
  dailyPlanMet: 0,
  inspectionQuality: 0,
  reportProactivity: 0,
};

const EMPTY_DETAIL: KpiDetail = {
  requiredDays: 0,
  morningOnTimeDays: 0,
  eveningOnTimeDays: 0,
  totalCompletedTasks: 0,
  onScheduleTasks: 0,
  totalEvening: 0,
  metOrOverCount: 0,
  totalInspected: 0,
  inspectedPassFirstTime: 0,
  proactivityRaw: 0,
};

export function scoreToRank(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  return "D";
}

function ratioToPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function emptyKpiResult(): KpiResult {
  return {
    score: 0,
    rank: "D",
    weights: WEIGHTS,
    breakdown: { ...EMPTY_BREAKDOWN } satisfies KpiBreakdown,
    detail: { ...EMPTY_DETAIL } satisfies KpiDetail,
  };
}

async function calculateInspectionQuality(input: {
  projectId: string;
  from: Date;
  to: Date;
  activeDaySet: Set<string>;
}) {
  const logs = await prisma.taskLog.findMany({
    where: {
      task: {
        projectId: input.projectId,
        isActive: true,
      },
      logType: TaskLogType.status_change,
      OR: [{ newValue: TaskStatus.inspected }, { oldValue: TaskStatus.inspected }],
    },
    select: {
      taskId: true,
      oldValue: true,
      newValue: true,
      createdAt: true,
    },
    orderBy: [{ taskId: "asc" }, { createdAt: "asc" }],
  });

  if (!logs.length) {
    return {
      totalInspected: 0,
      inspectedPassFirstTime: 0,
    };
  }

  const logsByTaskId = new Map<
    string,
    Array<{
      taskId: string;
      oldValue: string | null;
      newValue: string | null;
      createdAt: Date;
    }>
  >();

  for (const row of logs) {
    const list = logsByTaskId.get(row.taskId) ?? [];
    list.push(row);
    logsByTaskId.set(row.taskId, list);
  }

  let totalInspected = 0;
  let inspectedPassFirstTime = 0;

  for (const taskLogs of Array.from(logsByTaskId.values())) {
    const firstInspected = taskLogs.find((row) => row.newValue === TaskStatus.inspected);
    if (!firstInspected) continue;

    const firstInspectedDay = toUtcStartOfDay(firstInspected.createdAt);
    if (firstInspectedDay < input.from || firstInspectedDay > input.to) continue;
    if (!input.activeDaySet.has(formatUtcYmd(firstInspectedDay))) continue;

    totalInspected += 1;

    const rejectedAfterFirstInspection = taskLogs.some(
      (row) => row.createdAt > firstInspected.createdAt && row.oldValue === TaskStatus.inspected && row.newValue !== TaskStatus.inspected,
    );

    if (!rejectedAfterFirstInspection) {
      inspectedPassFirstTime += 1;
    }
  }

  return {
    totalInspected,
    inspectedPassFirstTime,
  };
}

export async function calculateKpiForProjectEngineer(input: {
  projectId: string;
  reporterId: string;
  from: Date;
  to: Date;
}) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, goLiveDate: true },
  });

  if (!project || !project.goLiveDate) {
    return emptyKpiResult();
  }

  const goLiveStart = toUtcStartOfDay(project.goLiveDate);
  const today = nowUtcDateOnly();
  const inputFrom = toUtcStartOfDay(input.from);
  const inputTo = toUtcStartOfDay(input.to);

  const from = inputFrom < goLiveStart ? goLiveStart : inputFrom;
  const to = inputTo > today ? today : inputTo;

  if (from > to) {
    return emptyKpiResult();
  }

  const restDates = await getProjectSiteRestDates(input.projectId, from, to);
  const activeDays = getActivityDates(project, from, to, restDates);
  const requiredDays = activeDays.length;
  const activeDaySet = new Set(activeDays.map((d) => formatUtcYmd(d)));

  const [morningReports, eveningReports, completedTasks, inspectionQuality] = await Promise.all([
    prisma.morningReport.findMany({
      where: {
        projectId: input.projectId,
        reporterId: input.reporterId,
        reportDate: { gte: from, lte: to },
      },
      select: {
        reportDate: true,
        submittedAt: true,
        isOnTime: true,
      },
    }),
    prisma.eveningReport.findMany({
      where: {
        projectId: input.projectId,
        reporterId: input.reporterId,
        reportDate: { gte: from, lte: to },
      },
      select: {
        reportDate: true,
        submittedAt: true,
        isOnTime: true,
        overallRating: true,
        taskReports: {
          select: {
            actualWork: true,
            actualWorkIfStarted: true,
            taskPhotos: {
              select: { id: true },
            },
          },
        },
      },
    }),
    prisma.task.findMany({
      where: {
        projectId: input.projectId,
        isActive: true,
        status: { in: [TaskStatus.done, TaskStatus.inspected] },
        actualEndDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        plannedEndDate: true,
        actualEndDate: true,
      },
    }),
    calculateInspectionQuality({
      projectId: input.projectId,
      from,
      to,
      activeDaySet,
    }),
  ]);

  const morningOnTimeDays = morningReports.filter((row) => row.submittedAt && row.isOnTime && activeDaySet.has(formatUtcYmd(row.reportDate))).length;

  const submittedEveningReports = eveningReports.filter((row) => row.submittedAt && activeDaySet.has(formatUtcYmd(row.reportDate)));
  const eveningOnTimeDays = submittedEveningReports.filter((row) => row.isOnTime).length;

  const completedTasksInActiveDays = completedTasks.filter((task) => task.actualEndDate && activeDaySet.has(formatUtcYmd(task.actualEndDate)));
  const totalCompletedTasks = completedTasksInActiveDays.length;
  const onScheduleTasks = completedTasksInActiveDays.filter((task) => task.actualEndDate && task.actualEndDate <= task.plannedEndDate).length;

  const totalEvening = submittedEveningReports.length;
  const metOrOverCount = submittedEveningReports.filter((row) => row.overallRating === DailyRating.MET || row.overallRating === DailyRating.OVER).length;

  const totalInspected = inspectionQuality.totalInspected;
  const inspectedPassFirstTime = inspectionQuality.inspectedPassFirstTime;

  let proactiveAccumulator = 0;
  let proactiveCount = 0;

  for (const report of submittedEveningReports) {
    for (const taskRow of report.taskReports) {
      const hasNote = Boolean((taskRow.actualWork || taskRow.actualWorkIfStarted || "").trim());
      proactiveAccumulator += taskRow.taskPhotos.length + (hasNote ? 1 : 0);
      proactiveCount += 1;
    }
  }

  const proactivityRaw = proactiveCount > 0 ? (proactiveAccumulator / proactiveCount) * 10 : 0;
  const reportProactivity = Math.min(100, proactivityRaw);

  const breakdown: KpiBreakdown = {
    morningOnTime: ratioToPercent(morningOnTimeDays, requiredDays),
    eveningOnTime: ratioToPercent(eveningOnTimeDays, requiredDays),
    taskOnSchedule: ratioToPercent(onScheduleTasks, totalCompletedTasks),
    dailyPlanMet: ratioToPercent(metOrOverCount, totalEvening),
    inspectionQuality: ratioToPercent(inspectedPassFirstTime, totalInspected),
    reportProactivity,
  };

  const weightedScore =
    (breakdown.morningOnTime * WEIGHTS.morningOnTime +
      breakdown.eveningOnTime * WEIGHTS.eveningOnTime +
      breakdown.taskOnSchedule * WEIGHTS.taskOnSchedule +
      breakdown.dailyPlanMet * WEIGHTS.dailyPlanMet +
      breakdown.inspectionQuality * WEIGHTS.inspectionQuality +
      breakdown.reportProactivity * WEIGHTS.reportProactivity) /
    100;

  const score = Number(weightedScore.toFixed(2));

  return {
    score,
    rank: scoreToRank(score),
    weights: WEIGHTS,
    breakdown,
    detail: {
      requiredDays,
      morningOnTimeDays,
      eveningOnTimeDays,
      totalCompletedTasks,
      onScheduleTasks,
      totalEvening,
      metOrOverCount,
      totalInspected,
      inspectedPassFirstTime,
      proactivityRaw: Number(proactivityRaw.toFixed(2)),
    } satisfies KpiDetail,
  };
}

export async function calculateKpiHistoryForMonths(input: {
  projectId: string;
  reporterId: string;
  monthStart: Date;
  months: number;
}) {
  const rows: Array<{
    month: string;
    score: number;
    rank: string;
  }> = [];

  let cursor = new Date(Date.UTC(input.monthStart.getUTCFullYear(), input.monthStart.getUTCMonth(), 1, 0, 0, 0));

  for (let i = 0; i < input.months; i += 1) {
    const start = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1, 0, 0, 0));
    const end = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const kpi = await calculateKpiForProjectEngineer({
      projectId: input.projectId,
      reporterId: input.reporterId,
      from: start,
      to: end,
    });
    rows.push({
      month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
      score: kpi.score,
      rank: kpi.rank,
    });
    cursor = addUtcDays(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1, 0, 0, 0)), 0);
  }

  return rows.reverse();
}
