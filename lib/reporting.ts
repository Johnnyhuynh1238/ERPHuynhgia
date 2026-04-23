import { KpiSnapshotType, PauseReason, ProjectMemberRole, ReportDecision, TaskStatus, UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addUtcDays, formatUtcYmd, localDeadlineForDate, nowUtcDateOnly, parseMonthInput, parseYmdToUtcDate, toUtcEndOfDay, toUtcStartOfDay } from "@/lib/date";

export const PAUSE_REASON_LABEL: Record<PauseReason, string> = {
  RAIN: "Mưa",
  LACK_MATERIAL: "Thiếu vật tư",
  WAIT_INSPECTION: "Chờ nghiệm thu",
  WAIT_SUBCONTRACTOR: "Chờ thầu phụ",
  WAIT_CUSTOMER: "Chờ chủ nhà duyệt",
  OTHER: "Khác",
};

export const REPORT_DECISION_LABEL: Record<ReportDecision, string> = {
  WORK: "Làm được",
  PAUSE: "Tạm dừng",
};

export type UserCtx = { id: string; role: string };

export function canManageProjectReports(user: UserCtx) {
  return user.role === UserRole.admin || user.role === UserRole.construction_manager;
}

export function canCreateProjectReport(user: UserCtx, project: { mainEngineerId: string }) {
  if (canManageProjectReports(user)) return true;
  return user.role === UserRole.engineer && user.id === project.mainEngineerId;
}

export function canViewProjectReport(user: UserCtx, project: { projectManagerId: string; mainEngineerId: string }, reporterId: string) {
  if (canManageProjectReports(user)) return true;
  if (user.id === reporterId) return true;
  if (user.id === project.mainEngineerId || user.id === project.projectManagerId) return true;
  return false;
}

export async function hasProjectRoleMember(projectId: string, userId: string, roleInProject: ProjectMemberRole[]) {
  const member = await prisma.projectMember.findFirst({
    where: {
      projectId,
      userId,
      roleInProject: { in: roleInProject },
    },
    select: { id: true },
  });
  return Boolean(member);
}

export function getMorningDeadline(date: Date) {
  return localDeadlineForDate(date, 8);
}

export function getEveningDeadline(date: Date) {
  return localDeadlineForDate(date, 19);
}

export async function getReportProjectForUser(projectId: string, user: UserCtx) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      code: true,
      name: true,
      goLiveDate: true,
      mainEngineerId: true,
      projectManagerId: true,
      status: true,
    },
  });

  if (!project) return null;

  if (canManageProjectReports(user)) return project;

  const isPrimary = user.id === project.mainEngineerId || user.id === project.projectManagerId;
  if (isPrimary) return project;

  const member = await prisma.projectMember.findFirst({
    where: {
      projectId,
      userId: user.id,
      roleInProject: {
        in: [ProjectMemberRole.engineer, ProjectMemberRole.foreman, ProjectMemberRole.construction_manager],
      },
    },
    select: { id: true },
  });

  return member ? project : null;
}

export function normalizeReportDate(dateInput?: string | null) {
  if (dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return parseYmdToUtcDate(dateInput);
  }
  return nowUtcDateOnly();
}

export async function getSiteRestDay(projectId: string, date: Date) {
  return prisma.siteRestDay.findUnique({
    where: {
      projectId_restDate: {
        projectId,
        restDate: toUtcStartOfDay(date),
      },
    },
  });
}

export function isProjectGoLive(project: { goLiveDate: Date | null }, date: Date) {
  if (!project.goLiveDate) return false;
  return toUtcStartOfDay(project.goLiveDate) <= toUtcStartOfDay(date);
}

export async function getMorningTaskGroups(projectId: string, date: Date) {
  const todayStart = toUtcStartOfDay(date);
  const todayEnd = toUtcEndOfDay(date);

  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      isActive: true,
      status: { not: TaskStatus.na },
      actualEndDate: null,
      OR: [{ actualStartDate: { not: null } }, { plannedStartDate: { lte: todayEnd } }],
    },
    orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      phase: true,
      status: true,
      plannedStartDate: true,
      plannedEndDate: true,
      actualStartDate: true,
      actualEndDate: true,
    },
  });

  return tasks.map((task) => {
    const isOverdue = task.plannedEndDate < todayStart && !task.actualEndDate;
    const isActualStarted = Boolean(task.actualStartDate);

    let group: "A" | "B" | "C" = "C";
    if (isOverdue) group = "A";
    else if (isActualStarted) group = "B";

    const overdueDays = isOverdue ? Math.floor((todayStart.getTime() - task.plannedEndDate.getTime()) / 86400000) : 0;

    return {
      ...task,
      group,
      overdueDays,
      groupOrder: group === "A" ? 0 : group === "B" ? 1 : 2,
    };
  });
}

export async function getPreviousMorningTaskDecision(projectId: string, taskId: string, reportDate: Date) {
  const previousDate = addUtcDays(reportDate, -1);
  const previousMorning = await prisma.morningReport.findFirst({
    where: {
      projectId,
      reportDate: toUtcStartOfDay(previousDate),
    },
    include: {
      taskReports: {
        where: { taskId },
        select: {
          decision: true,
          plannedActivity: true,
          pauseReason: true,
          pauseNote: true,
        },
      },
    },
  });

  return previousMorning?.taskReports[0] || null;
}

export function validateMorningTaskInput(input: {
  decision: ReportDecision;
  plannedActivity?: string | null;
  pauseReason?: PauseReason | null;
  pauseNote?: string | null;
}) {
  if (input.decision === ReportDecision.WORK) {
    if (!input.plannedActivity || input.plannedActivity.trim().length < 10) {
      return "Nội dung kế hoạch khi chọn Làm được phải tối thiểu 10 ký tự";
    }
    return null;
  }

  if (!input.pauseReason) {
    return "Phải chọn lý do tạm dừng";
  }

  if (!input.pauseNote || input.pauseNote.trim().length < 5) {
    return "Ghi chú tạm dừng tối thiểu 5 ký tự";
  }

  return null;
}

export function validateEveningTaskWorkInput(input: {
  completionPercent?: number | null;
  actualWork?: string | null;
  rating?: "MET" | "UNDER" | "OVER" | null;
  explanation?: string | null;
  taskPhotoIds: string[];
}) {
  if (typeof input.completionPercent !== "number" || input.completionPercent < 0 || input.completionPercent > 100) {
    return "% khối lượng phải từ 0 đến 100";
  }

  if (!input.actualWork || input.actualWork.trim().length < 5) {
    return "Thực tế đã làm tối thiểu 5 ký tự";
  }

  if (!input.rating) {
    return "Phải chọn đánh giá task";
  }

  if (input.rating === "UNDER" && (!input.explanation || input.explanation.trim().length < 5)) {
    return "Khi không đạt kế hoạch phải có giải thích";
  }

  if (input.taskPhotoIds.length < 1) {
    return "Mỗi task WORK phải có ít nhất 1 ảnh";
  }

  return null;
}

export function validateEveningTaskPauseInput(input: {
  stillPaused?: boolean | null;
  actualWorkIfStarted?: string | null;
  taskPhotoIds: string[];
}) {
  if (typeof input.stillPaused !== "boolean") {
    return "Phải xác nhận trạng thái tạm dừng";
  }

  if (!input.stillPaused) {
    if (!input.actualWorkIfStarted || input.actualWorkIfStarted.trim().length < 5) {
      return "Khi đã bắt đầu lại, cần nhập nội dung thực tế đã làm";
    }

    if (input.taskPhotoIds.length < 1) {
      return "Khi đã bắt đầu lại, phải có ít nhất 1 ảnh task";
    }
  }

  return null;
}

export function getActivityDates(project: { goLiveDate: Date | null }, from: Date, to: Date, restDates: Date[]) {
  if (!project.goLiveDate) return [] as Date[];

  const start = toUtcStartOfDay(from < project.goLiveDate ? project.goLiveDate : from);
  const end = toUtcStartOfDay(to);
  if (start > end) return [] as Date[];

  const restSet = new Set(restDates.map((d) => formatUtcYmd(d)));
  const days: Date[] = [];
  let cursor = start;
  while (cursor <= end) {
    if (!restSet.has(formatUtcYmd(cursor))) {
      days.push(cursor);
    }
    cursor = addUtcDays(cursor, 1);
  }

  return days;
}

export async function getReportProjectIdsForEngineer(userId: string) {
  const [main, members] = await Promise.all([
    prisma.project.findMany({ where: { mainEngineerId: userId }, select: { id: true } }),
    prisma.projectMember.findMany({
      where: {
        userId,
        roleInProject: ProjectMemberRole.engineer,
      },
      select: { projectId: true },
    }),
  ]);

  const ids = new Set<string>();
  main.forEach((p) => ids.add(p.id));
  members.forEach((m) => ids.add(m.projectId));
  return Array.from(ids);
}

export async function getReportProjectsForUser(user: UserCtx) {
  if (canManageProjectReports(user)) {
    return prisma.project.findMany({
      where: { status: { not: "completed" } },
      select: { id: true, code: true, name: true, goLiveDate: true },
      orderBy: [{ status: "asc" }, { code: "asc" }],
    });
  }

  if (user.role !== UserRole.engineer) {
    return [] as { id: string; code: string; name: string; goLiveDate: Date | null }[];
  }

  const ids = await getReportProjectIdsForEngineer(user.id);
  if (ids.length === 0) return [];

  return prisma.project.findMany({
    where: {
      id: { in: ids },
      status: { not: "completed" },
    },
    select: { id: true, code: true, name: true, goLiveDate: true },
    orderBy: { code: "asc" },
  });
}

export async function createTaskLog(taskId: string, userId: string, content: string, logType: "note" | "report_edit" | "reminder_sent" = "note") {
  await prisma.taskLog.create({
    data: {
      taskId,
      userId,
      logType,
      content,
    },
  });
}

export async function createBulkTaskLogs(taskIds: string[], userId: string, content: string, logType: "note" | "report_edit" | "reminder_sent" = "note") {
  if (taskIds.length === 0) return;
  await prisma.taskLog.createMany({
    data: taskIds.map((taskId) => ({
      taskId,
      userId,
      logType,
      content,
    })),
  });
}

export async function ensureTaskIdsBelongToProject(projectId: string, taskIds: string[]) {
  const tasks = await prisma.task.findMany({
    where: {
      id: { in: taskIds },
      projectId,
    },
    select: { id: true },
  });

  return tasks.length === taskIds.length;
}

export async function fetchTaskPhotoRows(taskId: string, photoIds: string[]) {
  if (photoIds.length === 0) return [] as { id: string }[];
  return prisma.taskPhoto.findMany({
    where: {
      id: { in: photoIds },
      taskId,
    },
    select: { id: true },
  });
}

export async function getMonthRange(month: string | undefined | null) {
  const parsed = parseMonthInput(month, { rejectInvalid: true });
  if (!parsed) return null;
  return { month: parsed.month, start: parsed.start, end: parsed.end };
}

export async function getProjectSiteRestDates(projectId: string, from: Date, to: Date) {
  const rows = await prisma.siteRestDay.findMany({
    where: {
      projectId,
      restDate: {
        gte: toUtcStartOfDay(from),
        lte: toUtcStartOfDay(to),
      },
    },
    select: { restDate: true },
  });
  return rows.map((row) => row.restDate);
}

export function mapRatingToLabel(value: "MET" | "UNDER" | "OVER") {
  if (value === "MET") return "Đạt kế hoạch";
  if (value === "OVER") return "Vượt kế hoạch";
  return "Không đạt kế hoạch";
}

export async function getReminderTargetProjects() {
  const today = nowUtcDateOnly();
  return prisma.project.findMany({
    where: {
      goLiveDate: { not: null, lte: today },
      status: { in: ["planning", "in_progress", "paused"] },
    },
    select: { id: true, mainEngineerId: true },
  });
}

export function toProjectAccessWhere(user: UserCtx): Prisma.ProjectWhereInput {
  if (canManageProjectReports(user) || user.role === UserRole.accountant) {
    return {};
  }

  return {
    OR: [
      { projectManagerId: user.id },
      { mainEngineerId: user.id },
      {
        projectMembers: {
          some: { userId: user.id },
        },
      },
    ],
  };
}

export function parseKpiRoleFilter(roleInput: string | null | undefined) {
  if (!roleInput) return null;
  if (roleInput === UserRole.engineer || roleInput === UserRole.construction_manager) {
    return roleInput;
  }
  return null;
}

function getCurrentVietnamDate(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const year = parts.find((part) => part.type === "year")?.value;

  if (!month || !day || !year) {
    throw new Error("Không xác định được ngày theo múi giờ Việt Nam");
  }

  return `${year}-${month}-${day}`;
}

export function normalizeKpiSnapshotDateFromInput(dateInput: string | null | undefined) {
  if (dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return toUtcStartOfDay(new Date(`${dateInput}T00:00:00Z`));
  }
  const currentVietnamYmd = getCurrentVietnamDate(new Date());
  return toUtcStartOfDay(new Date(`${currentVietnamYmd}T00:00:00Z`));
}

export function monthStringOfDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function resolveMonthlyFinalRange(baseDate: Date) {
  const isFirstDay = baseDate.getUTCDate() === 1;
  const isLastDay = addUtcDays(baseDate, 1).getUTCDate() === 1;

  if (!isFirstDay && !isLastDay) {
    return null;
  }

  const monthAnchor = isFirstDay
    ? new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() - 1, 1, 0, 0, 0))
    : new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1, 0, 0, 0));

  const month = monthStringOfDate(monthAnchor);
  const parsed = parseMonthInput(month, { rejectInvalid: true });
  if (!parsed) {
    throw new Error("Không thể xác định tháng chốt KPI");
  }
  return parsed;
}

export async function upsertKpiSnapshot(input: {
  projectId: string;
  reporterId: string;
  date: Date;
  month: string;
  type: KpiSnapshotType;
  score: number;
  rank: string;
  payload: Prisma.InputJsonValue;
}) {
  return prisma.kpiSnapshot.upsert({
    where: {
      projectId_reporterId_date_type: {
        projectId: input.projectId,
        reporterId: input.reporterId,
        date: toUtcStartOfDay(input.date),
        type: input.type,
      },
    },
    update: {
      month: input.month,
      score: input.score,
      rank: input.rank,
      payload: input.payload,
    },
    create: {
      projectId: input.projectId,
      reporterId: input.reporterId,
      date: toUtcStartOfDay(input.date),
      month: input.month,
      type: input.type,
      score: input.score,
      rank: input.rank,
      payload: input.payload,
    },
  });
}
