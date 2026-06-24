import { ExpensePriority } from "@prisma/client";

export const REMINDER_INTERVAL_MS: Record<ExpensePriority, number> = {
  urgent: 1 * 60 * 1000,
  normal: 15 * 60 * 1000,
};

export function nextReminderForPriority(priority: ExpensePriority, from = new Date()): Date {
  return new Date(from.getTime() + REMINDER_INTERVAL_MS[priority]);
}
