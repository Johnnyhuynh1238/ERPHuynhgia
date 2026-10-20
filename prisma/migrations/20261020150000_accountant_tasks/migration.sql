-- Việc admin giao cho kế toán (tick xong trên /ketoan, nhắc Zalo mỗi 2 tiếng).
CREATE TABLE IF NOT EXISTS "accountant_tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "note" TEXT,
  "due_date" DATE,
  "status" VARCHAR(20) NOT NULL DEFAULT 'open',
  "created_by_name" VARCHAR(120),
  "done_at" TIMESTAMP(3),
  "done_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accountant_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "accountant_tasks_status_due_date_idx" ON "accountant_tasks"("status", "due_date");
