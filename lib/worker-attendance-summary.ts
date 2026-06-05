import { UserRole, WorkerAttendanceSession, type WorkerRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function canViewAdminWorkerAttendance(role: string | null | undefined) {
  return role === UserRole.admin || role === UserRole.accountant || role === UserRole.construction_manager;
}

export function canEditWorkerWage(role: string | null | undefined) {
  return role === UserRole.admin || role === UserRole.accountant;
}

export function parseDateOnly(input: string | null) {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const [y, m, d] = input.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

export function mondayOfWeekUtc(anyDayUtc: Date) {
  const d = new Date(anyDayUtc.getTime());
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function weekBoundsUtc(monday: Date) {
  const end = new Date(monday.getTime());
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: monday, endExclusive: end };
}

export function formatDateOnlyUtc(d: Date) {
  return d.toISOString().slice(0, 10);
}

export type WorkerWeekDayCell = { morning: boolean; afternoon: boolean };

export type WorkerWeekRow = {
  workerId: string;
  fullName: string;
  role: WorkerRole;
  phone: string | null;
  hasIdCardPhoto: boolean;
  dailyRate: number | null;
  days: Record<string, WorkerWeekDayCell>;
  sessionCount: number;
  workDays: number;
  totalWage: number | null;
};

export type WorkerWeekResponse = {
  projectId: string;
  weekStart: string;
  weekEnd: string;
  dates: string[];
  rows: WorkerWeekRow[];
  totals: {
    workDays: number;
    totalWage: number;
  };
};

export async function getWorkerAttendanceForWeek(args: {
  projectId: string;
  monday: Date;
}): Promise<WorkerWeekResponse> {
  const { projectId, monday } = args;
  const { start, endExclusive } = weekBoundsUtc(monday);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(formatDateOnlyUtc(d));
  }

  const [workers, ticks] = await Promise.all([
    prisma.worker.findMany({
      where: { projectId, status: "active" },
      orderBy: [{ sortRank: "desc" }, { fullName: "asc" }],
    }),
    prisma.workerAttendance.findMany({
      where: {
        projectId,
        present: true,
        date: { gte: start, lt: endExclusive },
      },
      select: { workerId: true, date: true, session: true },
    }),
  ]);

  const tickMap = new Map<string, Map<string, WorkerWeekDayCell>>();
  for (const t of ticks) {
    const dateKey = formatDateOnlyUtc(t.date);
    let perWorker = tickMap.get(t.workerId);
    if (!perWorker) {
      perWorker = new Map();
      tickMap.set(t.workerId, perWorker);
    }
    let cell = perWorker.get(dateKey);
    if (!cell) {
      cell = { morning: false, afternoon: false };
      perWorker.set(dateKey, cell);
    }
    if (t.session === WorkerAttendanceSession.morning) cell.morning = true;
    if (t.session === WorkerAttendanceSession.afternoon) cell.afternoon = true;
  }

  let totalsWorkDays = 0;
  let totalsWage = 0;

  const rows: WorkerWeekRow[] = workers.map((w) => {
    const days: Record<string, WorkerWeekDayCell> = {};
    let sessionCount = 0;
    const perWorker = tickMap.get(w.id);
    for (const dKey of dates) {
      const cell = perWorker?.get(dKey) ?? { morning: false, afternoon: false };
      days[dKey] = cell;
      if (cell.morning) sessionCount++;
      if (cell.afternoon) sessionCount++;
    }
    const workDays = sessionCount / 2;
    const totalWage = w.dailyRate != null ? Math.round(workDays * w.dailyRate) : null;

    totalsWorkDays += workDays;
    if (totalWage != null) totalsWage += totalWage;

    return {
      workerId: w.id,
      fullName: w.fullName,
      role: w.role,
      phone: w.phone,
      hasIdCardPhoto: Boolean(w.idCardPhotoUrl),
      dailyRate: w.dailyRate,
      days,
      sessionCount,
      workDays,
      totalWage,
    };
  });

  return {
    projectId,
    weekStart: formatDateOnlyUtc(start),
    weekEnd: formatDateOnlyUtc(new Date(endExclusive.getTime() - 86400000)),
    dates,
    rows,
    totals: {
      workDays: totalsWorkDays,
      totalWage: totalsWage,
    },
  };
}
