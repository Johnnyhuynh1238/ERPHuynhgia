-- add_task_centric_v1

-- Drop FKs/indexes tied to old report tables
ALTER TABLE IF EXISTS "customer_comments" DROP CONSTRAINT IF EXISTS "customer_comments_evening_report_id_fkey";
ALTER TABLE IF EXISTS "task_qc_logs" DROP CONSTRAINT IF EXISTS "task_qc_logs_evening_report_id_fkey";
ALTER TABLE IF EXISTS "task_photos" DROP CONSTRAINT IF EXISTS "task_photos_evening_report_task_id_fkey";

DROP INDEX IF EXISTS "customer_comments_evening_report_id_idx";
DROP INDEX IF EXISTS "task_qc_logs_evening_report_id_idx";
DROP INDEX IF EXISTS "task_photos_evening_report_task_id_idx";

ALTER TABLE IF EXISTS "customer_comments" DROP COLUMN IF EXISTS "evening_report_id";
ALTER TABLE IF EXISTS "task_qc_logs" DROP COLUMN IF EXISTS "evening_report_id";
ALTER TABLE IF EXISTS "task_photos" DROP COLUMN IF EXISTS "evening_report_task_id";

-- Drop old report tables
DROP TABLE IF EXISTS "evening_report_photos";
DROP TABLE IF EXISTS "evening_report_tasks";
DROP TABLE IF EXISTS "evening_reports";
DROP TABLE IF EXISTS "morning_report_tasks";
DROP TABLE IF EXISTS "morning_reports";

-- New enum types
DO $$ BEGIN CREATE TYPE "ProjectRoleType" AS ENUM ('pm_construction_manager','pm_engineer','pm_material_manager','pm_labor_manager','pm_accountant'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TechnicalAttachmentType" AS ENUM ('drawing','spec_doc','reference'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TechnicalReportStatus" AS ENUM ('working','paused','completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReportPhotoType" AS ENUM ('technical','material','labor','equipment'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Task fields
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "technical_requirements" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "construction_method" TEXT;

-- Assignments
CREATE TABLE IF NOT EXISTS "project_member_assignments" (
  "id" UUID PRIMARY KEY,
  "project_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "ProjectRoleType" NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assigned_by" UUID NOT NULL,
  CONSTRAINT "project_member_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_member_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "project_member_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_member_assignments_project_id_user_id_role_key" ON "project_member_assignments"("project_id","user_id","role");
CREATE INDEX IF NOT EXISTS "project_member_assignments_project_id_idx" ON "project_member_assignments"("project_id");
CREATE INDEX IF NOT EXISTS "project_member_assignments_user_id_idx" ON "project_member_assignments"("user_id");

-- Technical attachments
CREATE TABLE IF NOT EXISTS "task_technical_attachments" (
  "id" UUID PRIMARY KEY,
  "task_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_url" TEXT NOT NULL,
  "file_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "type" "TechnicalAttachmentType" NOT NULL DEFAULT 'drawing',
  "description" TEXT,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by" UUID NOT NULL,
  CONSTRAINT "task_technical_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_technical_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "task_technical_attachments_task_id_idx" ON "task_technical_attachments"("task_id");

-- Reports
CREATE TABLE IF NOT EXISTS "task_technical_reports" (
  "id" UUID PRIMARY KEY,
  "task_id" UUID NOT NULL,
  "report_date" DATE NOT NULL,
  "status" "TechnicalReportStatus" NOT NULL DEFAULT 'working',
  "pause_reason" TEXT,
  "technical_issue" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" UUID,
  CONSTRAINT "task_technical_reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_technical_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "task_technical_reports_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_technical_reports_task_id_report_date_key" ON "task_technical_reports"("task_id","report_date");
CREATE INDEX IF NOT EXISTS "task_technical_reports_task_id_idx" ON "task_technical_reports"("task_id");
CREATE INDEX IF NOT EXISTS "task_technical_reports_report_date_idx" ON "task_technical_reports"("report_date");

CREATE TABLE IF NOT EXISTS "task_material_reports" (
  "id" UUID PRIMARY KEY,
  "task_id" UUID NOT NULL,
  "report_date" DATE NOT NULL,
  "note" TEXT,
  "has_issue" BOOLEAN NOT NULL DEFAULT false,
  "issue_description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" UUID,
  CONSTRAINT "task_material_reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_material_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "task_material_reports_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_material_reports_task_id_report_date_key" ON "task_material_reports"("task_id","report_date");
CREATE INDEX IF NOT EXISTS "task_material_reports_task_id_idx" ON "task_material_reports"("task_id");

CREATE TABLE IF NOT EXISTS "task_labor_reports" (
  "id" UUID PRIMARY KEY,
  "task_id" UUID NOT NULL,
  "report_date" DATE NOT NULL,
  "master_worker_count" DECIMAL(5,2),
  "helper_count" DECIMAL(5,2),
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" UUID,
  CONSTRAINT "task_labor_reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_labor_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "task_labor_reports_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_labor_reports_task_id_report_date_key" ON "task_labor_reports"("task_id","report_date");
CREATE INDEX IF NOT EXISTS "task_labor_reports_task_id_idx" ON "task_labor_reports"("task_id");

CREATE TABLE IF NOT EXISTS "task_equipment_reports" (
  "id" UUID PRIMARY KEY,
  "task_id" UUID NOT NULL,
  "report_date" DATE NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" UUID,
  CONSTRAINT "task_equipment_reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_equipment_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "task_equipment_reports_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_equipment_reports_task_id_report_date_key" ON "task_equipment_reports"("task_id","report_date");
CREATE INDEX IF NOT EXISTS "task_equipment_reports_task_id_idx" ON "task_equipment_reports"("task_id");

CREATE TABLE IF NOT EXISTS "task_report_photos" (
  "id" UUID PRIMARY KEY,
  "task_id" UUID NOT NULL,
  "report_date" DATE NOT NULL,
  "type" "ReportPhotoType" NOT NULL,
  "technical_report_id" UUID,
  "file_url" TEXT NOT NULL,
  "caption" TEXT,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by" UUID NOT NULL,
  CONSTRAINT "task_report_photos_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_report_photos_technical_report_id_fkey" FOREIGN KEY ("technical_report_id") REFERENCES "task_technical_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_report_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "task_report_photos_task_id_report_date_idx" ON "task_report_photos"("task_id","report_date");
CREATE INDEX IF NOT EXISTS "task_report_photos_type_idx" ON "task_report_photos"("type");
