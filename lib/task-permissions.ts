import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

type UserCtx = { id: string; role: string };

type TaskCtx = {
  assignedEngineerId: string | null;
  assignedForemanId: string | null;
  project: { projectManagerId: string; mainEngineerId: string };
};

export async function getTaskWithAccess(taskId: string, user: UserCtx) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          projectManagerId: true,
          mainEngineerId: true,
        },
      },
    },
  });

  if (!task) return { task: null, allowed: false };

  const accessWhere = buildProjectAccessWhere({ id: user.id, role: user.role });
  const canViewProject = await prisma.project.findFirst({
    where: {
      id: task.projectId,
      ...accessWhere,
    },
    select: { id: true },
  });

  const isAssigned = task.assignedEngineerId === user.id || task.assignedForemanId === user.id;

  if (!canViewProject) {
    // Trường hợp hẹp: engineer/foreman được assign trực tiếp vẫn xem được task đó.
    if ((user.role === UserRole.engineer || user.role === UserRole.foreman) && isAssigned) {
      return { task, allowed: true };
    }
    return { task, allowed: false };
  }

  const isAdminLike = user.role === UserRole.admin || user.role === UserRole.accountant;
  const isProjectOwner = user.id === task.project.projectManagerId || user.id === task.project.mainEngineerId;

  if (isAdminLike || isProjectOwner) {
    return { task, allowed: true };
  }

  return { task, allowed: isAssigned };
}

export function canChangeStatus(task: TaskCtx, user: UserCtx) {
  if (user.role === UserRole.admin) return true;
  if (user.id === task.project.mainEngineerId || user.id === task.project.projectManagerId) return true;
  return task.assignedEngineerId === user.id || task.assignedForemanId === user.id;
}

export function canInspectTask(task: TaskCtx, user: UserCtx) {
  if (user.role === UserRole.admin) return true;
  return user.id === task.project.mainEngineerId;
}

export function canEditActualDates(task: TaskCtx, user: UserCtx) {
  if (user.role === UserRole.admin) return true;
  if (user.id === task.project.mainEngineerId) return true;
  return task.assignedEngineerId === user.id || task.assignedForemanId === user.id;
}

export function canUpdateQc(task: TaskCtx, user: UserCtx) {
  if (user.role === UserRole.admin) return true;
  if (user.id === task.project.mainEngineerId) return true;
  return task.assignedEngineerId === user.id;
}

export function canUploadPhoto(task: TaskCtx, user: UserCtx) {
  if (user.role === UserRole.admin) return true;
  if (user.id === task.project.mainEngineerId) return true;
  return task.assignedEngineerId === user.id || task.assignedForemanId === user.id;
}
