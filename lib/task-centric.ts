import { ProjectRoleType, TaskStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function getTodayDateVn(): Date {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export async function getUserProjectRoles(userId: string, projectId: string): Promise<ProjectRoleType[]> {
  const rows = await prisma.projectMemberAssignment.findMany({
    where: { userId, projectId },
    select: { role: true },
  });
  return rows.map((r) => r.role);
}

export function isAdminLike(role: UserRole | string) {
  return role === UserRole.admin;
}

export async function canReport(userId: string, role: UserRole | string, projectId: string, reportType: "technical" | "material" | "labor" | "equipment") {
  if (isAdminLike(role)) return true;
  const roles = await getUserProjectRoles(userId, projectId);
  if (roles.includes(ProjectRoleType.pm_construction_manager)) return true;
  if (reportType === "technical") return roles.includes(ProjectRoleType.pm_engineer);
  if (reportType === "material") return roles.includes(ProjectRoleType.pm_material_manager);
  return roles.includes(ProjectRoleType.pm_labor_manager);
}

export function mapTechnicalStatusToTaskStatus(status: "working" | "paused" | "completed", current: TaskStatus): TaskStatus {
  if (status === "completed") return TaskStatus.done;
  if (status === "working" && current === TaskStatus.not_started) return TaskStatus.in_progress;
  return current;
}
