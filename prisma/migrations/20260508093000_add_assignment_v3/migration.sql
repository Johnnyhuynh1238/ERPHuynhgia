-- CreateEnum
CREATE TYPE "AssignmentPriority" AS ENUM ('normal', 'important', 'urgent', 'critical');

-- CreateEnum
CREATE TYPE "TptcAssignmentStatus" AS ENUM ('pending', 'in_progress', 'done', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "DailyAssignmentType" AS ENUM ('template_item', 'progress_update', 'tptc_assignment');

-- CreateEnum
CREATE TYPE "DailyAssignmentStatus" AS ENUM ('pending', 'done', 'not_applicable');

-- Rename guide columns in qc template (keep data)
ALTER TABLE "qc_checklist_templates"
RENAME COLUMN "preparation_steps" TO "guide_preparation";

ALTER TABLE "qc_checklist_templates"
RENAME COLUMN "execution_steps" TO "guide_execution";

ALTER TABLE "qc_checklist_templates"
RENAME COLUMN "common_mistakes" TO "guide_mistakes";

ALTER TABLE "qc_checklist_templates"
RENAME COLUMN "before_qc_steps" TO "guide_before_qc";

-- CreateTable
CREATE TABLE "task_assignment_template_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_template_id" UUID NOT NULL,
    "qc_template_id" UUID,
    "display_order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "guide_content" TEXT,
    "require_photo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "task_assignment_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tptc_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "assigned_to_user_id" UUID NOT NULL,
    "assigned_by_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "AssignmentPriority" NOT NULL DEFAULT 'normal',
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "TptcAssignmentStatus" NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "ks_note" TEXT,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tptc_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_daily_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ks_user_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "task_id" UUID,
    "tptc_assignment_id" UUID,
    "type" "DailyAssignmentType" NOT NULL,
    "template_item_id" UUID,
    "title" TEXT NOT NULL,
    "guide_content" TEXT,
    "require_photo" BOOLEAN NOT NULL DEFAULT false,
    "priority" "AssignmentPriority" NOT NULL DEFAULT 'normal',
    "status" "DailyAssignmentStatus" NOT NULL DEFAULT 'pending',
    "photo_url" TEXT,
    "note" TEXT,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_daily_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_report_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ks_user_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "total_items" INTEGER NOT NULL,
    "done_items" INTEGER NOT NULL,
    "not_applicable_items" INTEGER NOT NULL,

    CONSTRAINT "daily_report_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_assignment_template_items_task_template_id_display_order_idx" ON "task_assignment_template_items"("task_template_id", "display_order");

-- CreateIndex
CREATE INDEX "task_assignment_template_items_qc_template_id_idx" ON "task_assignment_template_items"("qc_template_id");

-- CreateIndex
CREATE INDEX "tptc_assignments_assigned_to_user_id_status_due_at_idx" ON "tptc_assignments"("assigned_to_user_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "tptc_assignments_assigned_by_user_id_idx" ON "tptc_assignments"("assigned_by_user_id");

-- CreateIndex
CREATE INDEX "tptc_assignments_project_id_idx" ON "tptc_assignments"("project_id");

-- CreateIndex
CREATE INDEX "task_daily_assignments_ks_user_id_report_date_idx" ON "task_daily_assignments"("ks_user_id", "report_date");

-- CreateIndex
CREATE INDEX "task_daily_assignments_task_id_report_date_idx" ON "task_daily_assignments"("task_id", "report_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_report_submissions_ks_user_id_report_date_key" ON "daily_report_submissions"("ks_user_id", "report_date");

-- AddForeignKey
ALTER TABLE "task_assignment_template_items" ADD CONSTRAINT "task_assignment_template_items_task_template_id_fkey" FOREIGN KEY ("task_template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignment_template_items" ADD CONSTRAINT "task_assignment_template_items_qc_template_id_fkey" FOREIGN KEY ("qc_template_id") REFERENCES "qc_checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tptc_assignments" ADD CONSTRAINT "tptc_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tptc_assignments" ADD CONSTRAINT "tptc_assignments_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tptc_assignments" ADD CONSTRAINT "tptc_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_daily_assignments" ADD CONSTRAINT "task_daily_assignments_ks_user_id_fkey" FOREIGN KEY ("ks_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_daily_assignments" ADD CONSTRAINT "task_daily_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_daily_assignments" ADD CONSTRAINT "task_daily_assignments_tptc_assignment_id_fkey" FOREIGN KEY ("tptc_assignment_id") REFERENCES "tptc_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_daily_assignments" ADD CONSTRAINT "task_daily_assignments_template_item_id_fkey" FOREIGN KEY ("template_item_id") REFERENCES "task_assignment_template_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_submissions" ADD CONSTRAINT "daily_report_submissions_ks_user_id_fkey" FOREIGN KEY ("ks_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
