-- CreateEnum
CREATE TYPE "PaymentScheduleType" AS ENUM ('contract', 'addendum');

-- CreateEnum
CREATE TYPE "CommentTargetType" AS ENUM ('project', 'task', 'payment_schedule', 'journal_entry');

-- CreateEnum
CREATE TYPE "CustomerExportJobType" AS ENUM ('pdf', 'zip');

-- CreateEnum
CREATE TYPE "CustomerExportJobStatus" AS ENUM ('queued', 'processing', 'ready', 'failed');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'overdue';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'cancelled';

-- AlterTable
ALTER TABLE "payment_schedules"
ADD COLUMN "type" "PaymentScheduleType" NOT NULL DEFAULT 'contract',
ADD COLUMN "installment_no" INTEGER,
ADD COLUMN "description" TEXT,
ADD COLUMN "due_date" DATE,
ADD COLUMN "paid_at" DATE,
ADD COLUMN "paid_amount" DECIMAL(15,2),
ADD COLUMN "receipt_url" TEXT,
ADD COLUMN "payment_note" TEXT,
ADD COLUMN "created_by" UUID;

-- AlterTable
ALTER TABLE "customer_comments"
ADD COLUMN "target_type" "CommentTargetType",
ADD COLUMN "target_id" UUID,
ADD COLUMN "author_type" TEXT,
ADD COLUMN "author_id" UUID,
ADD COLUMN "author_name" TEXT,
ADD COLUMN "parent_id" UUID;

-- CreateTable
CREATE TABLE "project_drawings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "file_url" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_drawings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_export_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "type" "CustomerExportJobType" NOT NULL,
    "status" "CustomerExportJobStatus" NOT NULL DEFAULT 'queued',
    "file_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "customer_export_jobs_pkey" PRIMARY KEY ("id")
);

-- Backfill payment v2 fields from the existing schedule shape
UPDATE "payment_schedules"
SET
    "installment_no" = COALESCE("installment_no", "phase_number"),
    "description" = COALESCE("description", "milestone_description"),
    "due_date" = COALESCE("due_date", "expected_date"),
    "paid_at" = COALESCE("paid_at", "actual_paid_date"),
    "paid_amount" = COALESCE("paid_amount", "actual_paid_amount"),
    "payment_note" = COALESCE("payment_note", "notes"),
    "type" = COALESCE("type", 'contract');

-- Backfill polymorphic comment fields from legacy task/report columns
UPDATE "customer_comments" AS c
SET
    "target_type" = CASE
        WHEN c."task_id" IS NOT NULL THEN 'task'::"CommentTargetType"
        WHEN c."evening_report_id" IS NOT NULL THEN 'journal_entry'::"CommentTargetType"
        ELSE 'project'::"CommentTargetType"
    END,
    "target_id" = COALESCE(c."task_id", c."evening_report_id", c."project_id"),
    "author_type" = COALESCE(c."author_type", 'customer'),
    "author_name" = COALESCE(c."author_name", p."customer_name", 'Chủ nhà')
FROM "projects" AS p
WHERE c."project_id" = p."id"
  AND c."target_type" IS NULL;

-- CreateIndex
CREATE INDEX "payment_schedules_project_id_due_date_idx" ON "payment_schedules"("project_id", "due_date");

-- CreateIndex
CREATE INDEX "payment_schedules_type_idx" ON "payment_schedules"("type");

-- CreateIndex
CREATE INDEX "customer_comments_project_id_target_type_target_id_idx" ON "customer_comments"("project_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "customer_comments_target_type_target_id_created_at_idx" ON "customer_comments"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_comments_author_id_idx" ON "customer_comments"("author_id");

-- CreateIndex
CREATE INDEX "customer_comments_parent_id_idx" ON "customer_comments"("parent_id");

-- CreateIndex
CREATE INDEX "project_drawings_project_id_display_order_idx" ON "project_drawings"("project_id", "display_order");

-- CreateIndex
CREATE INDEX "customer_export_jobs_project_id_created_at_idx" ON "customer_export_jobs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_export_jobs_status_created_at_idx" ON "customer_export_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "customer_export_jobs_expires_at_idx" ON "customer_export_jobs"("expires_at");

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_comments" ADD CONSTRAINT "customer_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_comments" ADD CONSTRAINT "customer_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "customer_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_drawings" ADD CONSTRAINT "project_drawings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_drawings" ADD CONSTRAINT "project_drawings_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_export_jobs" ADD CONSTRAINT "customer_export_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
