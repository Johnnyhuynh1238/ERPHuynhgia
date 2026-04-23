-- KPI snapshot cache table (daily + monthly final)
DO $$
BEGIN
  CREATE TYPE "KpiSnapshotType" AS ENUM ('DAILY', 'MONTHLY_FINAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "kpi_snapshots" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "reporter_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "month" TEXT NOT NULL,
  "type" "KpiSnapshotType" NOT NULL,
  "score" DECIMAL(5,2) NOT NULL,
  "rank" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kpi_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "kpi_snapshots_project_id_reporter_id_date_type_key"
  ON "kpi_snapshots"("project_id", "reporter_id", "date", "type");

CREATE INDEX IF NOT EXISTS "kpi_snapshots_project_id_month_type_idx"
  ON "kpi_snapshots"("project_id", "month", "type");

CREATE INDEX IF NOT EXISTS "kpi_snapshots_reporter_id_month_type_idx"
  ON "kpi_snapshots"("reporter_id", "month", "type");

DO $$
BEGIN
  ALTER TABLE "kpi_snapshots"
    ADD CONSTRAINT "kpi_snapshots_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "kpi_snapshots"
    ADD CONSTRAINT "kpi_snapshots_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
