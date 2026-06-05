-- Cột projectId cho TaskDailyAssignment (worker_attendance_* gắn project; rows khác để NULL)
ALTER TABLE "task_daily_assignments" ADD COLUMN "project_id" UUID;

ALTER TABLE "task_daily_assignments"
  ADD CONSTRAINT "task_daily_assignments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;

-- Idempotent seed cho cron: 1 task / (KS, ngày, type, project)
CREATE UNIQUE INDEX "task_daily_assignments_ks_user_id_report_date_type_project_id_key"
  ON "task_daily_assignments" ("ks_user_id", "report_date", "type", "project_id");

CREATE INDEX "task_daily_assignments_report_date_type_idx"
  ON "task_daily_assignments" ("report_date", "type");
