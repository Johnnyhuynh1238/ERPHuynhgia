-- M4: Chấm công cuối ngày + sản lượng theo phiếu giao việc
-- WorkerTimesheet (1 dòng/thợ/ngày) + WorkOrderOutput (1 dòng/phiếu) + WorkOrderOutputPhoto

DO $$ BEGIN
  CREATE TYPE "TimesheetAbsentReason" AS ENUM ('P', 'KP', 'MUA', 'CHO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WorkOrderOutputQcStatus" AS ENUM ('pending', 'passed', 'failed', 'rework');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- worker_timesheets: chấm công cuối ngày, dayValue 0/0.5/1
CREATE TABLE IF NOT EXISTS "worker_timesheets" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"     UUID NOT NULL,
  "worker_id"      UUID NOT NULL,
  "date"           DATE NOT NULL,
  "day_value"      DECIMAL(3, 2) NOT NULL,
  "absent_reason"  "TimesheetAbsentReason",
  "week_key"       VARCHAR(10) NOT NULL,
  "note"           TEXT,
  "created_by_id"  UUID NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "worker_timesheets_project_fk" FOREIGN KEY ("project_id")    REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "worker_timesheets_worker_fk"  FOREIGN KEY ("worker_id")     REFERENCES "workers"("id") ON DELETE CASCADE,
  CONSTRAINT "worker_timesheets_created_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "worker_timesheets_worker_date_uq" ON "worker_timesheets"("worker_id", "date");
CREATE INDEX IF NOT EXISTS "worker_timesheets_project_date_idx" ON "worker_timesheets"("project_id", "date");
CREATE INDEX IF NOT EXISTS "worker_timesheets_project_week_idx" ON "worker_timesheets"("project_id", "week_key");

-- work_order_outputs: sản lượng + QC + duyệt theo lô tuần
CREATE TABLE IF NOT EXISTS "work_order_outputs" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "work_order_id"    UUID NOT NULL,
  "project_id"       UUID NOT NULL,
  "date"             DATE NOT NULL,
  "actual_qty"       DECIMAL(14, 3) NOT NULL,
  "approved_qty"     DECIMAL(14, 3),
  "qc_status"        "WorkOrderOutputQcStatus" NOT NULL DEFAULT 'pending',
  "qc_checklist_id"  UUID,
  "week_key"         VARCHAR(10) NOT NULL,
  "note"             TEXT,
  "created_by_id"    UUID NOT NULL,
  "approved_by_id"   UUID,
  "approved_at"      TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_order_outputs_wo_fk"       FOREIGN KEY ("work_order_id")  REFERENCES "work_orders"("id") ON DELETE CASCADE,
  CONSTRAINT "work_order_outputs_project_fk"  FOREIGN KEY ("project_id")     REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "work_order_outputs_created_fk"  FOREIGN KEY ("created_by_id")  REFERENCES "users"("id"),
  CONSTRAINT "work_order_outputs_approved_fk" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_order_outputs_wo_uq" ON "work_order_outputs"("work_order_id");
CREATE INDEX IF NOT EXISTS "work_order_outputs_project_date_idx" ON "work_order_outputs"("project_id", "date");
CREATE INDEX IF NOT EXISTS "work_order_outputs_project_week_idx" ON "work_order_outputs"("project_id", "week_key");
CREATE INDEX IF NOT EXISTS "work_order_outputs_qc_status_idx" ON "work_order_outputs"("qc_status");

-- work_order_output_photos: ảnh sản lượng (bắt buộc ≥1 ở app-level)
CREATE TABLE IF NOT EXISTS "work_order_output_photos" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "output_id"       UUID NOT NULL,
  "storage_key"     TEXT NOT NULL,
  "width"           INTEGER,
  "height"          INTEGER,
  "size_bytes"      INTEGER,
  "content_type"    VARCHAR(60),
  "sort_rank"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "uploaded_by_id"  UUID NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_order_output_photos_output_fk"  FOREIGN KEY ("output_id")      REFERENCES "work_order_outputs"("id") ON DELETE CASCADE,
  CONSTRAINT "work_order_output_photos_uploaded_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
);

CREATE INDEX IF NOT EXISTS "work_order_output_photos_output_sort_idx" ON "work_order_output_photos"("output_id", "sort_rank");
