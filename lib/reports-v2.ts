import { ProjectMemberRole, TaskStatus, UserRole } from "@prisma/client";
import { addUtcDays, formatUtcYmd, toUtcEndOfDay, toUtcStartOfDay } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export type MorningGroupKey = "overdue" | "in_progress" | "starting_today" | "upcoming";

export function getNowVnTimeLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function getMorningDeadlineLabel() {
  return "08:00";
}

export function isMorningLate(submittedAt: Date, reportDate: Date) {
  const dateLabel = formatUtcYmd(reportDate);
  const deadline = new Date(`${dateLabel}T08:00:00+07:00`);
  return submittedAt.getTime() > deadline.getTime();
}

export function canViewReportsHub(role: string) {
  return role === UserRole.admin || role === UserRole.engineer || role === UserRole.construction_manager;
}

export function canManageMorningCheckin(role: string) {
  return role === UserRole.admin || role === UserRole.engineer;
}

export async function getProjectForReports(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      code: true,
      name: true,
      goLiveDate: true,
      mainEngineerId: true,
    },
  });
}

export async function isEngineerMemberOfProject(userId: string, projectId: string) {
  const member = await prisma.projectMember.findFirst({
    where: {
      projectId,
      userId,
      roleInProject: ProjectMemberRole.engineer,
    },
    select: { id: true },
  });

  return Boolean(member);
}

export async function canAccessProjectReports(input: { userId: string; role: string; projectId: string }) {
  if (input.role === UserRole.admin || input.role === UserRole.construction_manager) {
    return true;
  }

  if (input.role !== UserRole.engineer) {
    return false;
  }

  const project = await getProjectForReports(input.projectId);
  if (!project) return false;
  if (project.mainEngineerId === input.userId) return true;
  return isEngineerMemberOfProject(input.userId, input.projectId);
}

export async function getVisibleProjectsForUser(user: { id: string; role: string }) {
  if (user.role === UserRole.admin || user.role === UserRole.construction_manager) {
    return prisma.project.findMany({
      where: {
        status: { in: ["planning", "in_progress", "paused"] },
      },
      select: {
        id: true,
        code: true,
        name: true,
        mainEngineerId: true,
      },
      orderBy: { code: "asc" },
    });
  }

  if (user.role !== UserRole.engineer) {
    return [] as Array<{ id: string; code: string; name: string; mainEngineerId: string }>;
  }

  const [mainProjects, memberRows] = await Promise.all([
    prisma.project.findMany({
      where: {
        mainEngineerId: user.id,
        status: { in: ["planning", "in_progress", "paused"] },
      },
      select: { id: true, code: true, name: true, mainEngineerId: true },
    }),
    prisma.projectMember.findMany({
      where: {
        userId: user.id,
        roleInProject: ProjectMemberRole.engineer,
      },
      select: { projectId: true },
    }),
  ]);

  const memberProjectIds = memberRows.map((row) => row.projectId);
  const memberProjects = memberProjectIds.length
    ? await prisma.project.findMany({
        where: {
          id: { in: memberProjectIds },
          status: { in: ["planning", "in_progress", "paused"] },
        },
        select: { id: true, code: true, name: true, mainEngineerId: true },
      })
    : [];

  const merged = new Map<string, { id: string; code: string; name: string; mainEngineerId: string }>();
  [...mainProjects, ...memberProjects].forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values()).sort((a, b) => a.code.localeCompare(b.code, "vi"));
}

export async function getMorningTaskCandidates(projectId: string, reportDate: Date) {
  const start = toUtcStartOfDay(reportDate);
  const end = toUtcEndOfDay(reportDate);

  const rows = await prisma.task.findMany({
    where: {
      projectId,
      isActive: true,
      status: { notIn: [TaskStatus.done, TaskStatus.na] },
      AND: [
        {
          OR: [{ actualEndDate: null }, { actualEndDate: { gt: start } }],
        },
        {
          OR: [{ actualStartDate: { not: null } }, { plannedStartDate: { lte: addUtcDays(end, 7) } }],
        },
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      plannedStartDate: true,
      plannedEndDate: true,
      actualStartDate: true,
    },
    orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
  });

  return rows.map((row) => {
    const overdueDays = row.plannedEndDate < start ? Math.max(1, Math.floor((start.getTime() - row.plannedEndDate.getTime()) / 86400000)) : 0;
    const daysUntil = row.plannedStartDate > start ? Math.floor((row.plannedStartDate.getTime() - start.getTime()) / 86400000) : 0;
    const progress = row.status === TaskStatus.in_progress ? 60 : null;

    let group: MorningGroupKey = "upcoming";
    if (row.plannedEndDate < start && row.status !== TaskStatus.done) {
      group = "overdue";
    } else if (row.status === TaskStatus.in_progress || row.actualStartDate) {
      group = "in_progress";
    } else if (formatUtcYmd(row.plannedStartDate) === formatUtcYmd(start)) {
      group = "starting_today";
    }

    return {
      taskId: row.id,
      taskCode: row.code,
      taskName: row.name,
      progress,
      daysLate: overdueDays > 0 ? overdueDays : null,
      daysUntil: daysUntil > 0 ? daysUntil : null,
      group,
    };
  });
}

export function defaultSelectedTaskIds(rows: Array<{ taskId: string; group: MorningGroupKey }>) {
  return rows.filter((row) => row.group === "in_progress" || row.group === "starting_today").map((row) => row.taskId);
}

export function sortByTaskCode<T extends { taskCode: string }>(rows: T[]) {
  return [...rows].sort((a, b) => a.taskCode.localeCompare(b.taskCode, "vi", { numeric: true }));
}
