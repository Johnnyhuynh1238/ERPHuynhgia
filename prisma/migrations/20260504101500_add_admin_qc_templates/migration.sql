-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('normal', 'internal_milestone', 'major_milestone');

-- AlterTable
ALTER TABLE "task_templates"
ADD COLUMN "category" "TaskCategory" NOT NULL DEFAULT 'normal',
ADD COLUMN "duration" INTEGER NOT NULL DEFAULT 1;

-- Backfill duration from legacy default_duration_days
UPDATE "task_templates"
SET "duration" = GREATEST(COALESCE("default_duration_days", 1), 1)
WHERE "duration" = 1;

-- CreateTable
CREATE TABLE "qc_checklist_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_template_id" UUID NOT NULL,
    "preparation_steps" TEXT,
    "execution_steps" TEXT,
    "common_mistakes" TEXT,
    "before_qc_steps" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qc_checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_checklist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "require_photo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "qc_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qc_checklist_templates_task_template_id_key" ON "qc_checklist_templates"("task_template_id");

-- CreateIndex
CREATE INDEX "qc_checklist_items_template_id_idx" ON "qc_checklist_items"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_checklist_items_template_id_display_order_key" ON "qc_checklist_items"("template_id", "display_order");

-- AddForeignKey
ALTER TABLE "qc_checklist_templates" ADD CONSTRAINT "qc_checklist_templates_task_template_id_fkey" FOREIGN KEY ("task_template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_checklist_templates" ADD CONSTRAINT "qc_checklist_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_checklist_items" ADD CONSTRAINT "qc_checklist_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "qc_checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
