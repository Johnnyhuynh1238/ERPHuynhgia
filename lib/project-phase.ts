import { PhaseStatus, Prisma, TaskPhase, TaskStatus } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export const LEGACY_PHASE_META: Record<TaskPhase, { code: string; name: string; order: number }> = {
  P1_CHUAN_BI: { code: "P1", name: "Chuẩn bị", order: 1 },
  P2_MONG: { code: "P2", name: "Móng", order: 2 },
  P3_KHUNG_TRET: { code: "P3", name: "Khung trệt", order: 3 },
  P4_KHUNG_LAU: { code: "P4", name: "Khung lầu", order: 4 },
  P5_ME_XAY_TO: { code: "P5", name: "M&E + xây tô", order: 5 },
  P6_OP_LAT: { code: "P6", name: "Ốp lát", order: 6 },
  P7_SON_BA: { code: "P7", name: "Sơn bả", order: 7 },
  P8_LAP_TB: { code: "P8", name: "Lắp thiết bị", order: 8 },
  P9_BAN_GIAO: { code: "P9", name: "Bàn giao", order: 9 },
};

export function atUtcDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

export function addDaysUtc(date: Date, days: number) {
  const base = atUtcDate(date);
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}

export function diffDaysUtc(fromDate: Date, toDate: Date) {
  const from = atUtcDate(fromDate).getTime();
  const to = atUtcDate(toDate).getTime();
  return Math.floor((to - from) / DAY_MS);
}

export function inferPhaseStatus(tasks: Array<{ status: TaskStatus; actualStartDate: Date | null }>) {
  if (tasks.length === 0) return PhaseStatus.not_started;

  const allCompleted = tasks.every((task) => task.status === TaskStatus.done || task.status === TaskStatus.inspected);
  if (allCompleted) return PhaseStatus.completed;

  const hasStarted = tasks.some(
    (task) =>
      !!task.actualStartDate ||
      task.status === TaskStatus.in_progress ||
      task.status === TaskStatus.done ||
      task.status === TaskStatus.inspected ||
      task.status === TaskStatus.delayed,
  );

  return hasStarted ? PhaseStatus.in_progress : PhaseStatus.not_started;
}

export async function recalcProjectPhasesTimeline(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { id: true, startDate: true },
  });

  if (!project) {
    throw new Error("Không tìm thấy dự án");
  }

  const phases = await tx.projectPhase.findMany({
    where: { projectId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  let previousEndDate: Date | null = null;

  for (const phase of phases) {
    const plannedStartDate = previousEndDate ? addDaysUtc(previousEndDate, 1) : atUtcDate(project.startDate);
    const plannedEndDate = addDaysUtc(plannedStartDate, Math.max(phase.duration, 1) - 1);

    await tx.projectPhase.update({
      where: { id: phase.id },
      data: {
        plannedStartDate,
        plannedEndDate,
      },
    });

    previousEndDate = phase.actualEndDate ?? plannedEndDate;
  }
}

export async function syncPhaseStatusByTaskId(
  tx: Prisma.TransactionClient,
  taskId: string,
  nowInput?: Date,
) {
  const now = atUtcDate(nowInput || new Date());

  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      phaseId: true,
    },
  });

  if (!task?.phaseId) {
    return;
  }

  const phase = await tx.projectPhase.findUnique({
    where: { id: task.phaseId },
    select: {
      id: true,
      projectId: true,
      status: true,
      actualStartDate: true,
      actualEndDate: true,
    },
  });

  if (!phase) return;

  const tasksInPhase = await tx.task.findMany({
    where: { phaseId: phase.id, isActive: true },
    select: {
      id: true,
      status: true,
      actualStartDate: true,
      actualEndDate: true,
    },
  });

  const inferred = inferPhaseStatus(tasksInPhase);
  const allCompleted = inferred === PhaseStatus.completed;

  const nextActualStartDate =
    phase.actualStartDate || tasksInPhase.filter((t) => t.actualStartDate).sort((a, b) => (a.actualStartDate! < b.actualStartDate! ? -1 : 1))[0]
      ?.actualStartDate || (inferred !== PhaseStatus.not_started ? now : null);

  const nextActualEndDate = allCompleted
    ? tasksInPhase
        .filter((t) => t.actualEndDate)
        .sort((a, b) => (a.actualEndDate! < b.actualEndDate! ? -1 : 1))
        .slice(-1)[0]?.actualEndDate || now
    : null;

  const shouldUpdate =
    phase.status !== inferred ||
    (nextActualStartDate && (!phase.actualStartDate || phase.actualStartDate.getTime() !== nextActualStartDate.getTime())) ||
    ((phase.actualEndDate?.getTime() || null) !== (nextActualEndDate?.getTime() || null));

  if (!shouldUpdate) return;

  await tx.projectPhase.update({
    where: { id: phase.id },
    data: {
      status: inferred,
      actualStartDate: nextActualStartDate,
      actualEndDate: nextActualEndDate,
    },
  });

  if (allCompleted || phase.actualEndDate !== nextActualEndDate) {
    await recalcProjectPhasesTimeline(tx, phase.projectId);
  }
}

export async function checkProjectDeadline(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      startDate: true,
      plannedDeadline: true,
    },
  });

  if (!project) {
    throw new Error("Không tìm thấy dự án");
  }

  const phases = await tx.projectPhase.findMany({
    where: { projectId },
    orderBy: { displayOrder: "asc" },
    select: { duration: true },
  });

  const totalPhaseDuration = phases.reduce((sum, phase) => sum + Math.max(phase.duration, 1), 0);
  const calculatedEndDate = addDaysUtc(project.startDate, Math.max(totalPhaseDuration, 1) - 1);

  if (!project.plannedDeadline) {
    return {
      plannedDeadline: null,
      totalPhaseDuration,
      calculatedEndDate,
      isOverDeadline: false,
      exceedDays: 0,
    };
  }

  const exceedDays = Math.max(0, diffDaysUtc(project.plannedDeadline, calculatedEndDate));

  return {
    plannedDeadline: project.plannedDeadline,
    totalPhaseDuration,
    calculatedEndDate,
    isOverDeadline: exceedDays > 0,
    exceedDays,
  };
}
