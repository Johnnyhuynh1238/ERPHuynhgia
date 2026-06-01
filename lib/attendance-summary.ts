import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function canViewAdminAttendance(role: string | null | undefined) {
  return role === UserRole.admin || role === UserRole.accountant || role === UserRole.construction_manager;
}

export function parseMonth(input: string | null) {
  if (!input || !/^\d{4}-\d{2}$/.test(input)) return null;
  const [y, m] = input.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return { year: y, month: m };
}

export function monthBoundsUtc(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start, end };
}

export type DaySummary = {
  date: string;
  sessions: number;
  totalMinutes: number;
  hasOpen: boolean;
  firstIn: string | null;
  lastOut: string | null;
};

export type KsAttendanceSummary = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  daysWorked: number;
  openDays: number;
  totalMinutes: number;
  days: DaySummary[];
};

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getKsAttendanceForMonth(args: {
  year: number;
  month: number;
  userId?: string | null;
}): Promise<KsAttendanceSummary[]> {
  const { start, end } = monthBoundsUtc(args.year, args.month);

  const users = await prisma.user.findMany({
    where: {
      role: { in: [UserRole.engineer, UserRole.accountant] },
      isActive: true,
      ...(args.userId ? { id: args.userId } : {}),
    },
    select: { id: true, fullName: true, email: true, isActive: true, role: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  if (users.length === 0) return [];

  const rows = await prisma.ksAttendance.findMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      workDate: { gte: start, lt: end },
    },
    orderBy: [{ userId: "asc" }, { workDate: "asc" }, { checkInAt: "asc" }],
    select: {
      userId: true,
      workDate: true,
      checkInAt: true,
      checkOutAt: true,
      durationMinutes: true,
    },
  });

  const byUser = new Map<string, Map<string, DaySummary>>();
  for (const row of rows) {
    const userMap = byUser.get(row.userId) || new Map<string, DaySummary>();
    const key = ymd(row.workDate);
    const cur = userMap.get(key) || {
      date: key,
      sessions: 0,
      totalMinutes: 0,
      hasOpen: false,
      firstIn: null,
      lastOut: null,
    };
    cur.sessions += 1;
    cur.totalMinutes += row.durationMinutes || 0;
    if (!row.checkOutAt) cur.hasOpen = true;
    const inIso = row.checkInAt.toISOString();
    if (!cur.firstIn || inIso < cur.firstIn) cur.firstIn = inIso;
    if (row.checkOutAt) {
      const outIso = row.checkOutAt.toISOString();
      if (!cur.lastOut || outIso > cur.lastOut) cur.lastOut = outIso;
    }
    userMap.set(key, cur);
    byUser.set(row.userId, userMap);
  }

  return users.map((u) => {
    const days = Array.from((byUser.get(u.id) || new Map()).values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const totalMinutes = days.reduce((s, d) => s + d.totalMinutes, 0);
    const openDays = days.filter((d) => d.hasOpen).length;
    return {
      userId: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      daysWorked: days.length,
      openDays,
      totalMinutes,
      days,
    };
  });
}
