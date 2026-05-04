-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'internal_approved';
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'completed';

-- CreateEnum
CREATE TYPE "TaskOrigin" AS ENUM ('template', 'custom');

-- CreateEnum
CREATE TYPE "TaskActivityType" AS ENUM (
  'status_changed',
  'progress_updated',
  'qc_item_checked',
  'qc_item_unchecked',
  'qc_completed',
  'internal_approved',
  'customer_signed',
  'task_created',
  'task_updated'
);

-- AlterTable
ALTER TABLE "tasks"
ADD COLUMN "origin" "TaskOrigin" NOT NULL DEFAULT 'template',
ADD COLUMN "category" "TaskCategory" NOT NULL DEFAULT 'normal',
ADD COLUMN "progress_percent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "progress_updated_at" TIMESTAMP(3),
ADD COLUMN "qc_completed_at" TIMESTAMP(3),
ADD COLUMN "internal_approved_by" UUID,
ADD COLUMN "internal_approved_at" TIMESTAMP(3),
ADD COLUMN "internal_approver_note" TEXT,
ADD COLUMN "customer_signed_at" TIMESTAMP(3),
ADD COLUMN "customer_signature_url" TEXT;

-- CreateTable
CREATE TABLE "task_progress_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "from_percent" INTEGER NOT NULL,
    "to_percent" INTEGER NOT NULL,
    "photo_url" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_progress_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_qc_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "is_passed" BOOLEAN NOT NULL DEFAULT false,
    "photo_url" TEXT,
    "note" TEXT,
    "checked_by" UUID NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_qc_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_activity_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "TaskActivityType" NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "metadata" JSONB,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_activity_logs_pkey" PRIMARY KEY ("id")
);

-- Backfill
UPDATE "tasks"
SET "origin" = 'template'
WHERE "origin" IS NULL;

-- CreateIndex
CREATE INDEX "task_progress_history_task_id_created_at_idx" ON "task_progress_history"("task_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_qc_results_task_id_item_id_key" ON "task_qc_results"("task_id", "item_id");

-- CreateIndex
CREATE INDEX "task_qc_results_task_id_idx" ON "task_qc_results"("task_id");

-- CreateIndex
CREATE INDEX "task_activity_logs_task_id_created_at_idx" ON "task_activity_logs"("task_id", "created_at");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_internal_approved_by_fkey" FOREIGN KEY ("internal_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_progress_history" ADD CONSTRAINT "task_progress_history_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_progress_history" ADD CONSTRAINT "task_progress_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_qc_results" ADD CONSTRAINT "task_qc_results_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_qc_results" ADD CONSTRAINT "task_qc_results_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "qc_checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_qc_results" ADD CONSTRAINT "task_qc_results_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activity_logs" ADD CONSTRAINT "task_activity_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activity_logs" ADD CONSTRAINT "task_activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
