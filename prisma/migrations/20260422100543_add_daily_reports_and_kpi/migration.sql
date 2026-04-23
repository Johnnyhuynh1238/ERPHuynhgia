-- Extend existing enum values
ALTER TYPE "TaskLogType" ADD VALUE IF NOT EXISTS 'report_edit';
ALTER TYPE "TaskLogType" ADD VALUE IF NOT EXISTS 'reminder_sent';

-- Create new enums
DO $$
BEGIN
  CREATE TYPE "PauseReason" AS ENUM (
    'RAIN',
    'LACK_MATERIAL',
    'WAIT_INSPECTION',
    'WAIT_SUBCONTRACTOR',
    'WAIT_CUSTOMER',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ReportDecision" AS ENUM ('WORK', 'PAUSE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DailyRating" AS ENUM ('MET', 'UNDER', 'OVER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SiteRestReason" AS ENUM ('SUNDAY', 'HOLIDAY', 'STORM', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add project go-live date
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "go_live_date" DATE;

-- Create site rest days
CREATE TABLE IF NOT EXISTS "site_rest_days" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "rest_date" DATE NOT NULL,
  "reason" "SiteRestReason" NOT NULL,
  "note" TEXT,
  "declared_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "site_rest_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_rest_days_project_id_rest_date_key"
  ON "site_rest_days"("project_id", "rest_date");

CREATE INDEX IF NOT EXISTS "site_rest_days_project_id_rest_date_idx"
  ON "site_rest_days"("project_id", "rest_date");

-- Create morning reports
CREATE TABLE IF NOT EXISTS "morning_reports" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "reporter_id" UUID NOT NULL,
  "report_date" DATE NOT NULL,
  "submitted_at" TIMESTAMP(3),
  "is_on_time" BOOLEAN NOT NULL DEFAULT false,
  "overall_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "morning_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "morning_reports_project_id_report_date_reporter_id_key"
  ON "morning_reports"("project_id", "report_date", "reporter_id");

CREATE INDEX IF NOT EXISTS "morning_reports_project_id_report_date_idx"
  ON "morning_reports"("project_id", "report_date");

-- Create morning report task rows
CREATE TABLE IF NOT EXISTS "morning_report_tasks" (
  "id" UUID NOT NULL,
  "morning_report_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "decision" "ReportDecision" NOT NULL,
  "planned_activity" TEXT,
  "pause_reason" "PauseReason",
  "pause_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "morning_report_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "morning_report_tasks_morning_report_id_task_id_key"
  ON "morning_report_tasks"("morning_report_id", "task_id");

-- Create evening reports
CREATE TABLE IF NOT EXISTS "evening_reports" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "reporter_id" UUID NOT NULL,
  "report_date" DATE NOT NULL,
  "morning_report_id" UUID NOT NULL,
  "submitted_at" TIMESTAMP(3),
  "is_on_time" BOOLEAN NOT NULL DEFAULT false,
  "issues" TEXT,
  "overall_rating" "DailyRating" NOT NULL,
  "overall_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "evening_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evening_reports_morning_report_id_key"
  ON "evening_reports"("morning_report_id");

CREATE UNIQUE INDEX IF NOT EXISTS "evening_reports_project_id_report_date_reporter_id_key"
  ON "evening_reports"("project_id", "report_date", "reporter_id");

CREATE INDEX IF NOT EXISTS "evening_reports_project_id_report_date_idx"
  ON "evening_reports"("project_id", "report_date");

-- Create evening report task rows
CREATE TABLE IF NOT EXISTS "evening_report_tasks" (
  "id" UUID NOT NULL,
  "evening_report_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "completion_percent" INTEGER,
  "actual_work" TEXT,
  "issues" TEXT,
  "rating" "DailyRating",
  "explanation" TEXT,
  "still_paused" BOOLEAN,
  "actual_work_if_started" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "evening_report_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evening_report_tasks_evening_report_id_task_id_key"
  ON "evening_report_tasks"("evening_report_id", "task_id");

-- Create evening report site photos
CREATE TABLE IF NOT EXISTS "evening_report_photos" (
  "id" UUID NOT NULL,
  "evening_report_id" UUID NOT NULL,
  "photo_url" TEXT NOT NULL,
  "thumbnail_url" TEXT NOT NULL,
  "caption" TEXT,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "evening_report_photos_pkey" PRIMARY KEY ("id")
);

-- Link task photos to evening report task
ALTER TABLE "task_photos"
  ADD COLUMN IF NOT EXISTS "evening_report_task_id" UUID;

CREATE INDEX IF NOT EXISTS "task_photos_evening_report_task_id_idx"
  ON "task_photos"("evening_report_task_id");

-- Foreign keys
DO $$
BEGIN
  ALTER TABLE "site_rest_days"
    ADD CONSTRAINT "site_rest_days_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "site_rest_days"
    ADD CONSTRAINT "site_rest_days_declared_by_fkey"
    FOREIGN KEY ("declared_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "morning_reports"
    ADD CONSTRAINT "morning_reports_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "morning_reports"
    ADD CONSTRAINT "morning_reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "morning_report_tasks"
    ADD CONSTRAINT "morning_report_tasks_morning_report_id_fkey"
    FOREIGN KEY ("morning_report_id") REFERENCES "morning_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "morning_report_tasks"
    ADD CONSTRAINT "morning_report_tasks_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "evening_reports"
    ADD CONSTRAINT "evening_reports_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "evening_reports"
    ADD CONSTRAINT "evening_reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "evening_reports"
    ADD CONSTRAINT "evening_reports_morning_report_id_fkey"
    FOREIGN KEY ("morning_report_id") REFERENCES "morning_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "evening_report_tasks"
    ADD CONSTRAINT "evening_report_tasks_evening_report_id_fkey"
    FOREIGN KEY ("evening_report_id") REFERENCES "evening_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "evening_report_tasks"
    ADD CONSTRAINT "evening_report_tasks_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "evening_report_photos"
    ADD CONSTRAINT "evening_report_photos_evening_report_id_fkey"
    FOREIGN KEY ("evening_report_id") REFERENCES "evening_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "task_photos"
    ADD CONSTRAINT "task_photos_evening_report_task_id_fkey"
    FOREIGN KEY ("evening_report_task_id") REFERENCES "evening_report_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
