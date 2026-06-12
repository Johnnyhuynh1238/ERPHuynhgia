-- M5: QC GATE — hold-point mapping, output QC checks, worker QC issues

-- Drop unused placeholder field from M4
ALTER TABLE "work_order_outputs" DROP COLUMN IF EXISTS "qc_checklist_id";

-- Hold-point checklist config on budget items (TPTC managed)
ALTER TABLE "project_budget_items" ADD COLUMN IF NOT EXISTS "qc_checklist" JSONB;

-- Enums
DO $$ BEGIN
  CREATE TYPE "WorkOrderOutputQcCheckStatus" AS ENUM ('pending', 'passed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "WorkerQcIssueSeverity" AS ENUM ('minor', 'major', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Per-item check result per output
CREATE TABLE IF NOT EXISTS "work_order_output_qc_checks" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "output_id"      UUID NOT NULL REFERENCES "work_order_outputs"("id") ON DELETE CASCADE,
  "item_index"     INT NOT NULL,
  "item_title"     TEXT NOT NULL,
  "status"         "WorkOrderOutputQcCheckStatus" NOT NULL DEFAULT 'pending',
  "photo_key"      TEXT,
  "note"           TEXT,
  "checked_by_id"  UUID REFERENCES "users"("id"),
  "checked_at"     TIMESTAMP,
  "created_at"     TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "work_order_output_qc_checks_output_item_uq"
  ON "work_order_output_qc_checks" ("output_id", "item_index");
CREATE INDEX IF NOT EXISTS "work_order_output_qc_checks_output_status_idx"
  ON "work_order_output_qc_checks" ("output_id", "status");

-- Worker QC issues (rating source)
CREATE TABLE IF NOT EXISTS "worker_qc_issues" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "worker_id"      UUID NOT NULL REFERENCES "workers"("id") ON DELETE CASCADE,
  "output_id"      UUID REFERENCES "work_order_outputs"("id") ON DELETE SET NULL,
  "project_id"     UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "severity"       "WorkerQcIssueSeverity" NOT NULL,
  "reason"         TEXT NOT NULL,
  "occurred_at"    DATE NOT NULL,
  "created_by_id"  UUID NOT NULL REFERENCES "users"("id"),
  "created_at"     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "worker_qc_issues_worker_date_idx"
  ON "worker_qc_issues" ("worker_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "worker_qc_issues_project_date_idx"
  ON "worker_qc_issues" ("project_id", "occurred_at");
