-- Thêm priority + nextReminderAt cho expenses
-- urgent: cron nhắc 1 phút/lần · normal: 15 phút/lần — đến khi paid hoặc cancelled

CREATE TYPE "ExpensePriority" AS ENUM ('normal', 'urgent');

ALTER TABLE "expenses"
  ADD COLUMN "priority" "ExpensePriority" NOT NULL DEFAULT 'normal',
  ADD COLUMN "next_reminder_at" TIMESTAMP(3);

CREATE INDEX "expenses_next_reminder_at_idx"
  ON "expenses" ("next_reminder_at")
  WHERE "next_reminder_at" IS NOT NULL;

-- Backfill: các lệnh pending hiện có sẽ được nhắc ngay lần cron kế tiếp
UPDATE "expenses"
SET "next_reminder_at" = NOW()
WHERE "status" = 'pending';
