-- P1: Standard Task Catalog (xương sống mã GĐ-CT cho danh mục công tác nhà phố)
-- Additive only: CREATE TABLE + ADD COLUMN nullable. Không động vào TaskTemplate/Task cũ.

-- Catalog master table
CREATE TABLE IF NOT EXISTS "standard_task_catalog" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "phase_code"            TEXT NOT NULL,
  "task_code"             TEXT NOT NULL,
  "phase_name"            TEXT NOT NULL,
  "task_name"             TEXT NOT NULL,
  "group_label"           TEXT,
  "note"                  TEXT,
  "is_hold_point"         BOOLEAN NOT NULL DEFAULT false,
  "display_order"         INT NOT NULL,
  "retired_at"            TIMESTAMP,
  "default_team"          TEXT,
  "default_inspector"     TEXT,
  "default_offset_days"   INT,
  "default_duration_days" INT,
  "materials_needed"      TEXT,
  "qc_checklist"          TEXT,
  "proposer_role"         TEXT,
  "orderer_role"          TEXT,
  "receiver_role"         TEXT,
  "category"              "TaskCategory" NOT NULL DEFAULT 'normal',
  "is_milestone"          BOOLEAN NOT NULL DEFAULT false,
  "created_at"            TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "standard_task_catalog_phase_task_uq"
  ON "standard_task_catalog" ("phase_code", "task_code");
CREATE INDEX IF NOT EXISTS "standard_task_catalog_phase_order_idx"
  ON "standard_task_catalog" ("phase_code", "display_order");
CREATE INDEX IF NOT EXISTS "standard_task_catalog_retired_idx"
  ON "standard_task_catalog" ("retired_at");

-- Mapping columns trên task_templates (legacy → catalog)
ALTER TABLE "task_templates"
  ADD COLUMN IF NOT EXISTS "std_phase_code" TEXT,
  ADD COLUMN IF NOT EXISTS "std_task_code"  TEXT,
  ADD COLUMN IF NOT EXISTS "std_catalog_id" UUID;

ALTER TABLE "task_templates"
  ADD CONSTRAINT "task_templates_std_catalog_id_fkey"
  FOREIGN KEY ("std_catalog_id") REFERENCES "standard_task_catalog"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "task_templates_std_catalog_idx"
  ON "task_templates" ("std_catalog_id");

-- Mapping columns trên tasks (legacy → catalog)
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "std_phase_code" TEXT,
  ADD COLUMN IF NOT EXISTS "std_task_code"  TEXT,
  ADD COLUMN IF NOT EXISTS "std_catalog_id" UUID;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_std_catalog_id_fkey"
  FOREIGN KEY ("std_catalog_id") REFERENCES "standard_task_catalog"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "tasks_std_catalog_idx"
  ON "tasks" ("std_catalog_id");
