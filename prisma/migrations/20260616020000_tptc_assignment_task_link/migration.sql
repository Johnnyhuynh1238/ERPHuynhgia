-- TPTC assignment có thể gắn vào 1 task của dự án (nullable)
ALTER TABLE "tptc_assignments" ADD COLUMN "task_id" UUID;

ALTER TABLE "tptc_assignments"
  ADD CONSTRAINT "tptc_assignments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tptc_assignments_task_id_idx" ON "tptc_assignments"("task_id");
