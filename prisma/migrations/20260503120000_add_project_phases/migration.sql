-- add_project_phases

DO $$ BEGIN
  CREATE TYPE "PhaseStatus" AS ENUM ('not_started', 'in_progress', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "planned_deadline" DATE;

CREATE TABLE IF NOT EXISTS "project_phases" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "display_order" INTEGER NOT NULL,
  "duration" INTEGER NOT NULL,
  "planned_start_date" DATE NOT NULL,
  "planned_end_date" DATE NOT NULL,
  "actual_start_date" DATE,
  "actual_end_date" DATE,
  "status" "PhaseStatus" NOT NULL DEFAULT 'not_started',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  CONSTRAINT "project_phases_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_phases_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_phases_project_id_display_order_key" ON "project_phases"("project_id", "display_order");
CREATE INDEX IF NOT EXISTS "project_phases_project_id_idx" ON "project_phases"("project_id");

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "phase_id" UUID;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "duration" INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_phase_id_fkey"
    FOREIGN KEY ("phase_id") REFERENCES "project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "tasks_project_id_phase_id_is_active_idx" ON "tasks"("project_id", "phase_id", "is_active");

ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "phase_code" TEXT;
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "phase_name" TEXT;
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "phase_duration" INTEGER;
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "phase_order" INTEGER;

UPDATE "tasks"
SET "duration" = GREATEST(1, COALESCE("duration_days", 1));

UPDATE "task_templates"
SET
  "phase_code" = CASE
    WHEN "phase"::text = 'P1_CHUAN_BI' THEN 'P1'
    WHEN "phase"::text = 'P2_MONG' THEN 'P2'
    WHEN "phase"::text = 'P3_KHUNG_TRET' THEN 'P3'
    WHEN "phase"::text = 'P4_KHUNG_LAU' THEN 'P4'
    WHEN "phase"::text = 'P5_ME_XAY_TO' THEN 'P5'
    WHEN "phase"::text = 'P6_OP_LAT' THEN 'P6'
    WHEN "phase"::text = 'P7_SON_BA' THEN 'P7'
    WHEN "phase"::text = 'P8_LAP_TB' THEN 'P8'
    WHEN "phase"::text = 'P9_BAN_GIAO' THEN 'P9'
    ELSE 'P9'
  END,
  "phase_name" = CASE
    WHEN "phase"::text = 'P1_CHUAN_BI' THEN 'Chuẩn bị'
    WHEN "phase"::text = 'P2_MONG' THEN 'Móng'
    WHEN "phase"::text = 'P3_KHUNG_TRET' THEN 'Khung trệt'
    WHEN "phase"::text = 'P4_KHUNG_LAU' THEN 'Khung lầu'
    WHEN "phase"::text = 'P5_ME_XAY_TO' THEN 'M&E + xây tô'
    WHEN "phase"::text = 'P6_OP_LAT' THEN 'Ốp lát'
    WHEN "phase"::text = 'P7_SON_BA' THEN 'Sơn bả'
    WHEN "phase"::text = 'P8_LAP_TB' THEN 'Lắp thiết bị'
    WHEN "phase"::text = 'P9_BAN_GIAO' THEN 'Bàn giao'
    ELSE 'Bàn giao'
  END,
  "phase_order" = CASE
    WHEN "phase"::text = 'P1_CHUAN_BI' THEN 1
    WHEN "phase"::text = 'P2_MONG' THEN 2
    WHEN "phase"::text = 'P3_KHUNG_TRET' THEN 3
    WHEN "phase"::text = 'P4_KHUNG_LAU' THEN 4
    WHEN "phase"::text = 'P5_ME_XAY_TO' THEN 5
    WHEN "phase"::text = 'P6_OP_LAT' THEN 6
    WHEN "phase"::text = 'P7_SON_BA' THEN 7
    WHEN "phase"::text = 'P8_LAP_TB' THEN 8
    WHEN "phase"::text = 'P9_BAN_GIAO' THEN 9
    ELSE 9
  END
WHERE "phase_code" IS NULL OR "phase_name" IS NULL OR "phase_order" IS NULL;

WITH template_phase_bounds AS (
  SELECT
    "template_category",
    "phase",
    MIN("default_offset_days") AS min_offset,
    MAX("default_offset_days" + "default_duration_days" - 1) AS max_offset
  FROM "task_templates"
  GROUP BY "template_category", "phase"
)
UPDATE "task_templates" tt
SET "phase_duration" = GREATEST(1, b.max_offset - b.min_offset + 1)
FROM template_phase_bounds b
WHERE tt."template_category" = b."template_category"
  AND tt."phase" = b."phase"
  AND (tt."phase_duration" IS NULL OR tt."phase_duration" < 1);

WITH grouped AS (
  SELECT
    t."project_id",
    t."phase",
    MIN(t."planned_start_date") AS planned_start_date,
    MAX(t."planned_end_date") AS planned_end_date,
    MIN(t."actual_start_date") AS actual_start_date,
    MAX(t."actual_end_date") FILTER (WHERE t."status" IN ('done', 'inspected')) AS actual_end_date,
    CASE
      WHEN t."phase"::text = 'P1_CHUAN_BI' THEN 1
      WHEN t."phase"::text = 'P2_MONG' THEN 2
      WHEN t."phase"::text = 'P3_KHUNG_TRET' THEN 3
      WHEN t."phase"::text = 'P4_KHUNG_LAU' THEN 4
      WHEN t."phase"::text = 'P5_ME_XAY_TO' THEN 5
      WHEN t."phase"::text = 'P6_OP_LAT' THEN 6
      WHEN t."phase"::text = 'P7_SON_BA' THEN 7
      WHEN t."phase"::text = 'P8_LAP_TB' THEN 8
      ELSE 9
    END AS phase_order,
    CASE
      WHEN t."phase"::text = 'P1_CHUAN_BI' THEN 'P1'
      WHEN t."phase"::text = 'P2_MONG' THEN 'P2'
      WHEN t."phase"::text = 'P3_KHUNG_TRET' THEN 'P3'
      WHEN t."phase"::text = 'P4_KHUNG_LAU' THEN 'P4'
      WHEN t."phase"::text = 'P5_ME_XAY_TO' THEN 'P5'
      WHEN t."phase"::text = 'P6_OP_LAT' THEN 'P6'
      WHEN t."phase"::text = 'P7_SON_BA' THEN 'P7'
      WHEN t."phase"::text = 'P8_LAP_TB' THEN 'P8'
      ELSE 'P9'
    END AS phase_code,
    CASE
      WHEN t."phase"::text = 'P1_CHUAN_BI' THEN 'Chuẩn bị'
      WHEN t."phase"::text = 'P2_MONG' THEN 'Móng'
      WHEN t."phase"::text = 'P3_KHUNG_TRET' THEN 'Khung trệt'
      WHEN t."phase"::text = 'P4_KHUNG_LAU' THEN 'Khung lầu'
      WHEN t."phase"::text = 'P5_ME_XAY_TO' THEN 'M&E + xây tô'
      WHEN t."phase"::text = 'P6_OP_LAT' THEN 'Ốp lát'
      WHEN t."phase"::text = 'P7_SON_BA' THEN 'Sơn bả'
      WHEN t."phase"::text = 'P8_LAP_TB' THEN 'Lắp thiết bị'
      ELSE 'Bàn giao'
    END AS phase_name,
    CASE
      WHEN BOOL_AND(t."status" IN ('done', 'inspected')) THEN 'completed'::"PhaseStatus"
      WHEN BOOL_OR(t."actual_start_date" IS NOT NULL OR t."status" IN ('in_progress', 'done', 'inspected', 'delayed')) THEN 'in_progress'::"PhaseStatus"
      ELSE 'not_started'::"PhaseStatus"
    END AS phase_status,
    p."project_manager_id" AS created_by
  FROM "tasks" t
  INNER JOIN "projects" p ON p."id" = t."project_id"
  GROUP BY t."project_id", t."phase", p."project_manager_id"
), inserted AS (
  INSERT INTO "project_phases" (
    "project_id",
    "code",
    "name",
    "description",
    "display_order",
    "duration",
    "planned_start_date",
    "planned_end_date",
    "actual_start_date",
    "actual_end_date",
    "status",
    "created_by"
  )
  SELECT
    g."project_id",
    g.phase_code,
    g.phase_name,
    NULL,
    g.phase_order,
    GREATEST(1, (g.planned_end_date - g.planned_start_date) + 1),
    g.planned_start_date,
    g.planned_end_date,
    g.actual_start_date,
    CASE WHEN g.phase_status = 'completed'::"PhaseStatus" THEN g.actual_end_date ELSE NULL END,
    g.phase_status,
    g.created_by
  FROM grouped g
  WHERE NOT EXISTS (
    SELECT 1
    FROM "project_phases" p
    WHERE p."project_id" = g."project_id"
      AND p."display_order" = g.phase_order
  )
  RETURNING "id", "project_id", "display_order"
)
UPDATE "tasks" t
SET "phase_id" = p."id"
FROM "project_phases" p
WHERE p."project_id" = t."project_id"
  AND p."display_order" = CASE
    WHEN t."phase"::text = 'P1_CHUAN_BI' THEN 1
    WHEN t."phase"::text = 'P2_MONG' THEN 2
    WHEN t."phase"::text = 'P3_KHUNG_TRET' THEN 3
    WHEN t."phase"::text = 'P4_KHUNG_LAU' THEN 4
    WHEN t."phase"::text = 'P5_ME_XAY_TO' THEN 5
    WHEN t."phase"::text = 'P6_OP_LAT' THEN 6
    WHEN t."phase"::text = 'P7_SON_BA' THEN 7
    WHEN t."phase"::text = 'P8_LAP_TB' THEN 8
    ELSE 9
  END
  AND t."phase_id" IS NULL;

UPDATE "task_templates" SET "phase_code" = COALESCE("phase_code", 'P1');
UPDATE "task_templates" SET "phase_name" = COALESCE("phase_name", 'Chuẩn bị');
UPDATE "task_templates" SET "phase_order" = COALESCE("phase_order", 1);
UPDATE "task_templates" SET "phase_duration" = COALESCE(NULLIF("phase_duration", 0), 1);

ALTER TABLE "task_templates" ALTER COLUMN "phase_code" SET NOT NULL;
ALTER TABLE "task_templates" ALTER COLUMN "phase_name" SET NOT NULL;
ALTER TABLE "task_templates" ALTER COLUMN "phase_order" SET NOT NULL;
ALTER TABLE "task_templates" ALTER COLUMN "phase_duration" SET NOT NULL;
