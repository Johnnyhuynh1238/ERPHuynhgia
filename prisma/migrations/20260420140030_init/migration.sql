-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'engineer', 'foreman', 'accountant');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('planning', 'in_progress', 'completed', 'paused');

-- CreateEnum
CREATE TYPE "TaskPhase" AS ENUM ('P1_CHUAN_BI', 'P2_MONG', 'P3_KHUNG_TRET', 'P4_KHUNG_LAU', 'P5_ME_XAY_TO', 'P6_OP_LAT', 'P7_SON_BA', 'P8_LAP_TB', 'P9_BAN_GIAO');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('not_started', 'in_progress', 'done', 'inspected', 'delayed', 'na');

-- CreateEnum
CREATE TYPE "TaskLogType" AS ENUM ('status_change', 'note', 'photo_uploaded', 'assignment_change');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('not_collected', 'request_sent', 'collected', 'customer_late');

-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('engineer', 'foreman', 'accountant');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "area_m2" DECIMAL(12,2) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "contract_value" DECIMAL(15,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "expected_end_date" DATE NOT NULL,
    "actual_end_date" DATE,
    "project_manager_id" UUID NOT NULL,
    "main_engineer_id" UUID NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'planning',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "phase" "TaskPhase" NOT NULL,
    "name" TEXT NOT NULL,
    "default_offset_days" INTEGER NOT NULL,
    "default_duration_days" INTEGER NOT NULL,
    "default_team" TEXT NOT NULL,
    "default_inspector" TEXT NOT NULL,
    "materials_needed" TEXT NOT NULL,
    "proposer_role" TEXT NOT NULL,
    "orderer_role" TEXT NOT NULL,
    "receiver_role" TEXT NOT NULL,
    "qc_checklist" TEXT NOT NULL,
    "is_milestone" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL,
    "template_category" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "phase" "TaskPhase" NOT NULL,
    "name" TEXT NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "planned_start_date" DATE NOT NULL,
    "planned_end_date" DATE NOT NULL,
    "actual_start_date" DATE,
    "actual_end_date" DATE,
    "assigned_engineer_id" UUID,
    "assigned_foreman_id" UUID,
    "inspector_name" TEXT NOT NULL,
    "materials_needed" TEXT NOT NULL,
    "qc_checklist" TEXT NOT NULL,
    "is_milestone" BOOLEAN NOT NULL DEFAULT false,
    "status" "TaskStatus" NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_logs" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "log_type" "TaskLogType" NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_photos" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "photo_url" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "caption" TEXT,
    "file_size_kb" INTEGER NOT NULL,
    "taken_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_schedules" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "phase_number" INTEGER NOT NULL,
    "milestone_description" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "expected_date" DATE NOT NULL,
    "day_offset" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'not_collected',
    "actual_paid_date" DATE,
    "actual_paid_amount" DECIMAL(15,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_in_project" "ProjectMemberRole" NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by" UUID NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "tasks_project_id_phase_code_idx" ON "tasks"("project_id", "phase", "code");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "task_logs_task_id_created_at_idx" ON "task_logs"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "task_photos_task_id_created_at_idx" ON "task_photos"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_schedules_project_id_phase_number_idx" ON "payment_schedules"("project_id", "phase_number");

-- CreateIndex
CREATE INDEX "payment_schedules_status_idx" ON "payment_schedules"("status");

-- CreateIndex
CREATE INDEX "payment_schedules_expected_date_idx" ON "payment_schedules"("expected_date");

-- CreateIndex
CREATE INDEX "project_members_project_id_idx" ON "project_members"("project_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_main_engineer_id_fkey" FOREIGN KEY ("main_engineer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_engineer_id_fkey" FOREIGN KEY ("assigned_engineer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_foreman_id_fkey" FOREIGN KEY ("assigned_foreman_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_photos" ADD CONSTRAINT "task_photos_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_photos" ADD CONSTRAINT "task_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
