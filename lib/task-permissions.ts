import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

type UserCtx = { id: string; role: string };

type TaskCtx = {
  id: string;
  projectId: string;
  assignedEngineerId: string | null;
  assignedForemanId: string | null;
  visibleToCustomer?: boolean;
  isActive: boolean;
  plannedStartDate: Date;
  plannedEndDate: Date;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
  status: string;
  notes: string | null;
  team: string | null;
  inspectorName: string;
  name: string;
  phase: string;
  offsetDays: number;
  durationDays: number;
  qcChecklist: string;
  materialsNeeded: string;
  isMilestone: boolean;
  proposerRole: string;
  ordererRole: string;
  receiverRole: string;
  project: { projectManagerId: string; mainEngineerId: string };
};

export async function getTaskWithAccess(taskId: string, user: UserCtx) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      code: true,
      assignedEngineerId: true,
      assignedForemanId: true,
      visibleToCustomer: true,
      isActive: true,
      plannedStartDate: true,
      plannedEndDate: true,
      actualStartDate: true,
      actualEndDate: true,
      status: true,
      notes: true,
      team: true,
      inspectorName: true,
      name: true,
      phase: true,
      offsetDays: true,
      durationDays: true,
      qcChecklist: true,
      materialsNeeded: true,
      isMilestone: true,
      proposerRole: true,
      ordererRole: true,
      receiverRole: true,
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

  const isAdminLike =
    user.role === UserRole.admin ||
    user.role === UserRole.accountant ||
    user.role === UserRole.construction_manager;
  const isProjectOwner = user.id === task.project.projectManagerId || user.id === task.project.mainEngineerId;

  if (isAdminLike || isProjectOwner) {
    return { task, allowed: true };
  }

  // KS (engineer) là project member đã được xem mọi task của dự án; edit/QC/status vẫn gate riêng.
  if (user.role === UserRole.engineer) {
    return { task, allowed: true };
  }

  return { task, allowed: isAssigned };
}

export function canChangeStatus(task: TaskCtx, user: UserCtx) {
  return user.role === UserRole.admin || user.role === UserRole.construction_manager;
}

export function canInspectTask(task: TaskCtx, user: UserCtx) {
  if (user.role === UserRole.admin || user.role === UserRole.construction_manager) return true;
  return user.id === task.project.mainEngineerId;
}

export function canEditActualDates(task: TaskCtx, user: UserCtx) {
  if (user.role === UserRole.admin || user.role === UserRole.construction_manager) return true;
  return user.id === task.project.projectManagerId;
}

export function canUpdateQc(task: TaskCtx, user: UserCtx) {
  if (user.role === UserRole.admin || user.role === UserRole.construction_manager) return true;
  if (user.id === task.project.mainEngineerId) return true;
  return task.assignedEngineerId === user.id;
}

export function canUploadPhoto(task: TaskCtx, user: UserCtx) {
  if (user.role === UserRole.admin || user.role === UserRole.construction_manager) return true;
  if (user.id === task.project.mainEngineerId) return true;
  return task.assignedEngineerId === user.id || task.assignedForemanId === user.id;
}

export function canManageItem(_task: TaskCtx, user: UserCtx) {
  return user.role === UserRole.admin || user.role === UserRole.construction_manager || user.role === UserRole.engineer;
}
