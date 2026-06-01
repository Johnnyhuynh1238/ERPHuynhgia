import { prisma } from "@/lib/prisma";
import { hhmmToMinutes } from "@/lib/shifts";

type ResolvedShift = {
  shiftId: string;
  startMinutes: number;
  endMinutes: number;
  graceMinutes: number;
};

function isoDayOfWeekVn(date: Date): number {
  const en = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[en] ?? 0;
}

function clockMinutesVn(date: Date): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

async function getActiveShiftsForUserOnDay(userId: string, dayOfWeek: number): Promise<ResolvedShift[]> {
  const assignments = await prisma.userShiftAssignment.findMany({
    where: {
      userId,
      isActive: true,
      daysOfWeek: { has: dayOfWeek },
      shift: { isActive: true },
    },
    include: { shift: true },
  });
  return assignments.map((a) => ({
    shiftId: a.shift.id,
    startMinutes: hhmmToMinutes(a.shift.startTime),
    endMinutes: hhmmToMinutes(a.shift.endTime),
    graceMinutes: a.shift.graceMinutes,
  }));
}

export async function resolveCheckInShift(args: {
  userId: string;
  at: Date;
}): Promise<{ shiftId: string | null; lateMinutes: number | null }> {
  const dow = isoDayOfWeekVn(args.at);
  const shifts = await getActiveShiftsForUserOnDay(args.userId, dow);
  if (shifts.length === 0) return { shiftId: null, lateMinutes: null };

  const t = clockMinutesVn(args.at);
  // Pick shift whose startTime is closest to t; prefer startTime <= t (already in shift).
  const sorted = [...shifts].sort((a, b) => Math.abs(a.startMinutes - t) - Math.abs(b.startMinutes - t));
  const picked = sorted[0];
  const late = Math.max(0, t - picked.startMinutes - picked.graceMinutes);
  return { shiftId: picked.shiftId, lateMinutes: late };
}

export async function resolveCheckOutShift(args: {
  userId: string;
  at: Date;
  hintShiftId?: string | null;
}): Promise<{ shiftId: string | null; earlyLeaveMinutes: number | null }> {
  const dow = isoDayOfWeekVn(args.at);
  const shifts = await getActiveShiftsForUserOnDay(args.userId, dow);
  if (shifts.length === 0) return { shiftId: null, earlyLeaveMinutes: null };

  const t = clockMinutesVn(args.at);
  // Prefer the same shift as check-in if it still applies today; else pick shift whose endTime is closest to t.
  let picked = args.hintShiftId ? shifts.find((s) => s.shiftId === args.hintShiftId) : undefined;
  if (!picked) {
    const sorted = [...shifts].sort((a, b) => Math.abs(a.endMinutes - t) - Math.abs(b.endMinutes - t));
    picked = sorted[0];
  }
  const early = Math.max(0, picked.endMinutes - picked.graceMinutes - t);
  return { shiftId: picked.shiftId, earlyLeaveMinutes: early };
}
