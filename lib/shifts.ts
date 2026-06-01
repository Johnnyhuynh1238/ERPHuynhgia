import { UserRole } from "@prisma/client";

export function canManageShifts(role: string | null | undefined) {
  return role === UserRole.admin || role === UserRole.accountant;
}

export function isValidHHmm(s: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function hhmmToMinutes(s: string) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export const DAYS_OF_WEEK = [
  { value: 1, label: "T2" },
  { value: 2, label: "T3" },
  { value: 3, label: "T4" },
  { value: 4, label: "T5" },
  { value: 5, label: "T6" },
  { value: 6, label: "T7" },
  { value: 7, label: "CN" },
];

export function dayLabels(days: number[]): string {
  const set = new Set(days);
  return DAYS_OF_WEEK.filter((d) => set.has(d.value))
    .map((d) => d.label)
    .join(", ");
}
