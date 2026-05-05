import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatUtcYmd, nowUtcDateOnly, toUtcStartOfDay } from "@/lib/date";
import { getActivityDates, getProjectSiteRestDates, getReportProjectIdsForEngineer } from "@/lib/reporting";

const DEFAULT_SCORE = 70;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const COMPLETED_TASK_STATUSES = [TaskStatus.done, TaskStatus.internal_approved, TaskStatus.completed, TaskStatus.inspected];

export const DEFAULT_KPI_SETTINGS_WEIGHTS = {
  weightTienDo: 30,
  weightQc: 40,
  weightBaoCao: 10,
  weightChuNha: 10,
  weightDongGop: 10,
} as const;

export type KpiWeights = {
  schedule: number;
  qc: number;
  report: number;
  customer: number;
  contribution: number;
};

export type ActiveKpiSettings = {
  id: string | null;
  weightTienDo: number;
  weightQc: number;
  weightBaoCao: number;
  weightChuNha: number;
  weightDongGop: number;
  effectiveFromMonth: string;
  changedBy: string | null;
  changedAt: Date | null;
  reason: string | null;
  isFallback: boolean;
  weights: KpiWeights;
};

export type KpiComponentScores = {
  schedule: number;
  qc: number;
  report: number;
  customer: number;
  contribution: number;
};

export type KpiBreakdown = KpiComponentScores;

export type ScheduleKpiDetail = {
  defaultApplied: boolean;
  totalCompletedTasks: number;
  onScheduleTasks: number;
  lateOneToTwoDaysTasks: number;
  lateThreeToFiveDaysTasks: number;
  lateOverFiveDaysTasks: number;
  taskScores: Array<{
    taskId: string;
    plannedEndDate: string;
    actualEndDate: string;
    daysLate: number;
    score: number;
  }>;
};

export type QcKpiDetail = {
  defaultApplied: boolean;
  totalTasksWithQc: number;
  totalQcResults: number;
  passedAtFirstAttempt: number;
  unknownFirstAttempt: number;
  taskScores: Array<{
    taskId: string;
    totalQcResults: number;
    passedAtFirstAttempt: number;
    score: number;
  }>;
};

export type ReportKpiDetail = {
  defaultApplied: boolean;
  requiredDays: number;
  totalCheckins: number;
  morningOnTimeDays: number;
  morningCompleteDays: number;
  totalEvening: number;
  eveningOnTimeDays: number;
  eveningCompleteDays: number;
  components: {
    morningOnTime: number;
    morningComplete: number;
    eveningOnTime: number;
    eveningComplete: number;
  };
};

export type CustomerKpiDetail = {
  defaultApplied: boolean;
  taskRatingsCount: number;
  ksRatingsCount: number;
  averageTaskRating: number | null;
  averageKsRating: number | null;
  taskScore: number;
  ksScore: number;
};

export type ContributionKpiDetail = {
  defaultApplied: boolean;
  monthlyRecordId: string | null;
  contributionAt: string | null;
  contributionBy: string | null;
  note: string | null;
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
  schedule: ScheduleKpiDetail;
  qc: QcKpiDetail;
  report: ReportKpiDetail;
  customer: CustomerKpiDetail;
  contribution: ContributionKpiDetail;
  settings: ActiveKpiSettings;
};

export type KpiResult = {
  score: number;
  rank: string;
  weights: KpiWeights;
  settings: ActiveKpiSettings;
  scores: KpiComponentScores;
  breakdown: KpiBreakdown;
  detail: KpiDetail;
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratioToPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function monthStringFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthParts(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return { year, month: monthNumber };
}

function mapSettings(row: {
  id: string | null;
  weightTienDo: number;
  weightQc: number;
  weightBaoCao: number;
  weightChuNha: number;
  weightDongGop: number;
  effectiveFromMonth: string;
  changedBy: string | null;
  changedAt: Date | null;
  reason: string | null;
  isFallback: boolean;
}): ActiveKpiSettings {
  return {
    ...row,
    weights: {
      schedule: row.weightTienDo,
      qc: row.weightQc,
      report: row.weightBaoCao,
      customer: row.weightChuNha,
      contribution: row.weightDongGop,
    },
  };
}

export function scoreToRank(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  return "D";
}

export async function getActiveKpiSettings(month: string): Promise<ActiveKpiSettings> {
  const row = await prisma.kpiSettings.findFirst({
    where: { effectiveFromMonth: { lte: month } },
    orderBy: { effectiveFromMonth: "desc" },
    select: {
      id: true,
      weightTienDo: true,
      weightQc: true,
      weightBaoCao: true,
      weightChuNha: true,
      weightDongGop: true,
      effectiveFromMonth: true,
      changedBy: true,
      changedAt: true,
      reason: true,
    },
  });

  if (row) {
    return mapSettings({ ...row, isFallback: false });
  }

  return mapSettings({
    id: null,
    ...DEFAULT_KPI_SETTINGS_WEIGHTS,
    effectiveFromMonth: month,
    changedBy: null,
    changedAt: null,
    reason: "Fallback KPI v2 settings",
    isFallback: true,
  });
}

export function calculateWeightedKpiTotal(scores: KpiComponentScores, settings: ActiveKpiSettings) {
  const total =
    clampScore(scores.schedule) * (settings.weightTienDo / 100) +
    clampScore(scores.qc) * (settings.weightQc / 100) +
    clampScore(scores.report) * (settings.weightBaoCao / 100) +
    clampScore(scores.customer) * (settings.weightChuNha / 100) +
    clampScore(scores.contribution) * (settings.weightDongGop / 100);

  return round2(total);
}

async function resolveProjectIds(ksUserId: string, projectId?: string | null) {
  if (projectId) return [projectId];
  return getReportProjectIdsForEngineer(ksUserId);
}

async function calcKpiTienDo(input: { ksUserId: string; projectId?: string | null; from: Date; to: Date }) {
  const tasks = await prisma.task.findMany({
    where: {
      assignedEngineerId: input.ksUserId,
      projectId: input.projectId || undefined,
      isActive: true,
      status: { in: COMPLETED_TASK_STATUSES },
      actualEndDate: { gte: input.from, lte: input.to },
    },
    select: {
      id: true,
      plannedEndDate: true,
      actualEndDate: true,
    },
  });

  if (tasks.length === 0) {
    return {
      score: DEFAULT_SCORE,
      detail: {
        defaultApplied: true,
        totalCompletedTasks: 0,
        onScheduleTasks: 0,
        lateOneToTwoDaysTasks: 0,
        lateThreeToFiveDaysTasks: 0,
        lateOverFiveDaysTasks: 0,
        taskScores: [],
      } satisfies ScheduleKpiDetail,
    };
  }

  let onScheduleTasks = 0;
  let lateOneToTwoDaysTasks = 0;
  let lateThreeToFiveDaysTasks = 0;
  let lateOverFiveDaysTasks = 0;

  const taskScores = tasks.flatMap((task) => {
    if (!task.actualEndDate) return [];

    const daysLate = Math.max(0, Math.round((toUtcStartOfDay(task.actualEndDate).getTime() - toUtcStartOfDay(task.plannedEndDate).getTime()) / MS_PER_DAY));
    let score = 0;

    if (daysLate <= 0) {
      score = 100;
      onScheduleTasks += 1;
    } else if (daysLate <= 2) {
      score = 80;
      lateOneToTwoDaysTasks += 1;
    } else if (daysLate <= 5) {
      score = 50;
      lateThreeToFiveDaysTasks += 1;
    } else {
      lateOverFiveDaysTasks += 1;
    }

    return [
      {
        taskId: task.id,
        plannedEndDate: formatUtcYmd(task.plannedEndDate),
        actualEndDate: formatUtcYmd(task.actualEndDate),
        daysLate,
        score,
      },
    ];
  });

  return {
    score: round2(mean(taskScores.map((task) => task.score))),
    detail: {
      defaultApplied: false,
      totalCompletedTasks: taskScores.length,
      onScheduleTasks,
      lateOneToTwoDaysTasks,
      lateThreeToFiveDaysTasks,
      lateOverFiveDaysTasks,
      taskScores,
    } satisfies ScheduleKpiDetail,
  };
}

async function calcKpiQc(input: { ksUserId: string; projectId?: string | null; from: Date; to: Date }) {
  const tasks = await prisma.task.findMany({
    where: {
      assignedEngineerId: input.ksUserId,
      projectId: input.projectId || undefined,
      isActive: true,
      status: { in: COMPLETED_TASK_STATUSES },
      actualEndDate: { gte: input.from, lte: input.to },
      taskQcResults: { some: {} },
    },
    select: {
      id: true,
      taskQcResults: {
        select: {
          passedAtFirstAttempt: true,
        },
      },
    },
  });

  let unknownFirstAttempt = 0;
  let totalQcResults = 0;
  let passedAtFirstAttempt = 0;

  const taskScores = tasks.flatMap((task) => {
    const knownRows = task.taskQcResults.filter((row) => row.passedAtFirstAttempt !== null);
    unknownFirstAttempt += task.taskQcResults.length - knownRows.length;

    if (knownRows.length === 0) return [];

    const passed = knownRows.filter((row) => row.passedAtFirstAttempt).length;
    totalQcResults += knownRows.length;
    passedAtFirstAttempt += passed;

    return [
      {
        taskId: task.id,
        totalQcResults: knownRows.length,
        passedAtFirstAttempt: passed,
        score: round2(ratioToPercent(passed, knownRows.length)),
      },
    ];
  });

  if (taskScores.length === 0) {
    return {
      score: DEFAULT_SCORE,
      detail: {
        defaultApplied: true,
        totalTasksWithQc: 0,
        totalQcResults,
        passedAtFirstAttempt,
        unknownFirstAttempt,
        taskScores: [],
      } satisfies QcKpiDetail,
    };
  }

  return {
    score: round2(mean(taskScores.map((task) => task.score))),
    detail: {
      defaultApplied: false,
      totalTasksWithQc: taskScores.length,
      totalQcResults,
      passedAtFirstAttempt,
      unknownFirstAttempt,
      taskScores,
    } satisfies QcKpiDetail,
  };
}

async function calcKpiBaoCao(input: { ksUserId: string; projectId?: string | null; from: Date; to: Date }) {
  const projectIds = await resolveProjectIds(input.ksUserId, input.projectId);
  if (projectIds.length === 0) {
    return {
      score: DEFAULT_SCORE,
      detail: emptyReportDetail(true),
    };
  }

  const rangeTo = toUtcStartOfDay(input.to) > nowUtcDateOnly() ? nowUtcDateOnly() : toUtcStartOfDay(input.to);
  if (toUtcStartOfDay(input.from) > rangeTo) {
    return {
      score: DEFAULT_SCORE,
      detail: emptyReportDetail(true),
    };
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds }, goLiveDate: { not: null } },
    select: { id: true, goLiveDate: true },
  });

  let requiredDays = 0;
  let totalCheckins = 0;
  let morningOnTimeDays = 0;
  let morningCompleteDays = 0;
  let totalEvening = 0;
  let eveningOnTimeDays = 0;
  let eveningCompleteDays = 0;

  for (const project of projects) {
    const restDates = await getProjectSiteRestDates(project.id, input.from, rangeTo);
    const activeDays = getActivityDates(project, input.from, rangeTo, restDates);
    const activeDaySet = new Set(activeDays.map((day) => formatUtcYmd(day)));
    requiredDays += activeDays.length;

    const [morningCheckins, eveningReports] = await Promise.all([
      prisma.morningCheckin.findMany({
        where: {
          projectId: project.id,
          userId: input.ksUserId,
          reportDate: { gte: input.from, lte: rangeTo },
        },
        select: {
          reportDate: true,
          isLate: true,
          tasks: { select: { taskId: true } },
        },
      }),
      prisma.eveningReport.findMany({
        where: {
          projectId: project.id,
          reporterId: input.ksUserId,
          reportDate: { gte: input.from, lte: rangeTo },
        },
        select: {
          reportDate: true,
          isOnTime: true,
          taskReports: { select: { taskId: true } },
        },
      }),
    ]);

    const eveningByDate = new Map(eveningReports.map((report) => [formatUtcYmd(report.reportDate), report]));

    for (const checkin of morningCheckins) {
      const dateKey = formatUtcYmd(checkin.reportDate);
      if (!activeDaySet.has(dateKey)) continue;

      const pickedTaskIds = checkin.tasks.map((task) => task.taskId);
      const eveningReport = eveningByDate.get(dateKey);
      totalCheckins += 1;
      totalEvening += 1;

      if (!checkin.isLate) {
        morningOnTimeDays += 1;
      }

      if (pickedTaskIds.length > 0) {
        morningCompleteDays += 1;
      }

      if (eveningReport?.isOnTime) {
        eveningOnTimeDays += 1;
      }

      if (eveningReport) {
        const reportedTaskIds = new Set(eveningReport.taskReports.map((task) => task.taskId));
        if (pickedTaskIds.length === 0 || pickedTaskIds.every((taskId) => reportedTaskIds.has(taskId))) {
          eveningCompleteDays += 1;
        }
      }
    }
  }

  if (totalCheckins === 0) {
    return {
      score: DEFAULT_SCORE,
      detail: emptyReportDetail(true, requiredDays),
    };
  }

  const components = {
    morningOnTime: round2(ratioToPercent(morningOnTimeDays, requiredDays)),
    morningComplete: round2(ratioToPercent(morningCompleteDays, totalCheckins)),
    eveningOnTime: round2(ratioToPercent(eveningOnTimeDays, totalEvening)),
    eveningComplete: round2(ratioToPercent(eveningCompleteDays, totalEvening)),
  };

  return {
    score: round2(mean(Object.values(components))),
    detail: {
      defaultApplied: false,
      requiredDays,
      totalCheckins,
      morningOnTimeDays,
      morningCompleteDays,
      totalEvening,
      eveningOnTimeDays,
      eveningCompleteDays,
      components,
    } satisfies ReportKpiDetail,
  };
}

function emptyReportDetail(defaultApplied: boolean, requiredDays = 0): ReportKpiDetail {
  return {
    defaultApplied,
    requiredDays,
    totalCheckins: 0,
    morningOnTimeDays: 0,
    morningCompleteDays: 0,
    totalEvening: 0,
    eveningOnTimeDays: 0,
    eveningCompleteDays: 0,
    components: {
      morningOnTime: 0,
      morningComplete: 0,
      eveningOnTime: 0,
      eveningComplete: 0,
    },
  };
}

async function calcKpiChuNha(input: { ksUserId: string; projectId?: string | null; from: Date; to: Date }) {
  const [taskRatings, ksRatings] = await Promise.all([
    prisma.customerTaskRating.findMany({
      where: {
        ksUserId: input.ksUserId,
        projectId: input.projectId || undefined,
        ratedAt: { gte: input.from, lte: input.to },
      },
      select: { rating: true },
    }),
    prisma.customerKsRating.findMany({
      where: {
        ksUserId: input.ksUserId,
        projectId: input.projectId || undefined,
        ratedAt: { gte: input.from, lte: input.to },
      },
      select: {
        ratingExpertise: true,
        ratingAttitude: true,
        ratingCommunication: true,
      },
    }),
  ]);

  const averageTaskRating = taskRatings.length > 0 ? mean(taskRatings.map((rating) => rating.rating)) : null;
  const averageKsRating =
    ksRatings.length > 0
      ? mean(ksRatings.map((rating) => mean([rating.ratingExpertise, rating.ratingAttitude, rating.ratingCommunication])))
      : null;

  const taskScore = averageTaskRating === null ? DEFAULT_SCORE : round2((averageTaskRating / 5) * 100);
  const ksScore = averageKsRating === null ? DEFAULT_SCORE : round2((averageKsRating / 5) * 100);

  return {
    score: round2(taskScore * 0.5 + ksScore * 0.5),
    detail: {
      defaultApplied: taskRatings.length === 0 && ksRatings.length === 0,
      taskRatingsCount: taskRatings.length,
      ksRatingsCount: ksRatings.length,
      averageTaskRating: averageTaskRating === null ? null : round2(averageTaskRating),
      averageKsRating: averageKsRating === null ? null : round2(averageKsRating),
      taskScore,
      ksScore,
    } satisfies CustomerKpiDetail,
  };
}

async function calcKpiDongGop(input: { ksUserId: string; month: string }) {
  const { year, month } = monthParts(input.month);
  const monthly = await prisma.engineerKpiMonthly.findUnique({
    where: {
      userId_year_month: {
        userId: input.ksUserId,
        year,
        month,
      },
    },
    select: {
      id: true,
      scoreContribution: true,
      contributionAt: true,
      contributionBy: true,
      contributionNote: true,
    },
  });

  const hasManualScore = Boolean(monthly?.contributionAt || monthly?.contributionBy);
  const score = hasManualScore ? round2(monthly!.scoreContribution.toNumber()) : DEFAULT_SCORE;

  return {
    score,
    detail: {
      defaultApplied: !hasManualScore,
      monthlyRecordId: monthly?.id ?? null,
      contributionAt: monthly?.contributionAt?.toISOString() ?? null,
      contributionBy: monthly?.contributionBy ?? null,
      note: monthly?.contributionNote ?? null,
    } satisfies ContributionKpiDetail,
  };
}

export async function calculateEngineerKpiV2(input: {
  ksUserId: string;
  projectId?: string | null;
  from: Date;
  to: Date;
  month?: string | null;
}): Promise<KpiResult> {
  const month = input.month || monthStringFromDate(input.from);
  const settings = await getActiveKpiSettings(month);

  const [schedule, qc, report, customer, contribution] = await Promise.all([
    calcKpiTienDo(input),
    calcKpiQc(input),
    calcKpiBaoCao(input),
    calcKpiChuNha(input),
    calcKpiDongGop({ ksUserId: input.ksUserId, month }),
  ]);

  const scores: KpiComponentScores = {
    schedule: schedule.score,
    qc: qc.score,
    report: report.score,
    customer: customer.score,
    contribution: contribution.score,
  };
  const score = calculateWeightedKpiTotal(scores, settings);

  const breakdown: KpiBreakdown = { ...scores };

  return {
    score,
    rank: scoreToRank(score),
    weights: settings.weights,
    settings,
    scores,
    breakdown,
    detail: {
      requiredDays: report.detail.requiredDays,
      morningOnTimeDays: report.detail.morningOnTimeDays,
      eveningOnTimeDays: report.detail.eveningOnTimeDays,
      totalCompletedTasks: schedule.detail.totalCompletedTasks,
      onScheduleTasks: schedule.detail.onScheduleTasks,
      totalEvening: report.detail.totalEvening,
      metOrOverCount: report.detail.eveningCompleteDays,
      totalInspected: qc.detail.totalQcResults,
      inspectedPassFirstTime: qc.detail.passedAtFirstAttempt,
      proactivityRaw: scores.report,
      schedule: schedule.detail,
      qc: qc.detail,
      report: report.detail,
      customer: customer.detail,
      contribution: contribution.detail,
      settings,
    },
  };
}

export async function calculateKpiForProjectEngineer(input: {
  projectId: string;
  reporterId: string;
  from: Date;
  to: Date;
}) {
  return calculateEngineerKpiV2({
    ksUserId: input.reporterId,
    projectId: input.projectId,
    from: input.from,
    to: input.to,
  });
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
    const month = monthStringFromDate(start);
    const kpi = await calculateEngineerKpiV2({
      ksUserId: input.reporterId,
      projectId: input.projectId,
      from: start,
      to: end,
      month,
    });

    rows.push({
      month,
      score: kpi.score,
      rank: kpi.rank,
    });

    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1, 0, 0, 0));
  }

  return rows.reverse();
}
