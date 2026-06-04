-- Enum mở rộng
ALTER TYPE "DailyAssignmentType" ADD VALUE IF NOT EXISTS 'worker_attendance_morning';
ALTER TYPE "DailyAssignmentType" ADD VALUE IF NOT EXISTS 'worker_attendance_afternoon';

-- Enum mới
DO $$ BEGIN
  CREATE TYPE "WorkerRole" AS ENUM ('tho', 'phu');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WorkerAttendanceSession" AS ENUM ('morning', 'afternoon');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Bảng workers
CREATE TABLE "workers" (
  "id"                 UUID NOT NULL,
  "project_id"         UUID NOT NULL,
  "full_name"          TEXT NOT NULL,
  "phone"              TEXT,
  "role"               "WorkerRole" NOT NULL DEFAULT 'tho',
  "id_card_photo_url"  TEXT,
  "status"             VARCHAR(20) NOT NULL DEFAULT 'active',
  "sort_rank"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_by_id"      UUID NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workers_project_id_fkey"    FOREIGN KEY ("project_id")    REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "workers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id")    ON DELETE RESTRICT
);
CREATE INDEX "workers_project_id_status_idx" ON "workers"("project_id", "status");

-- Bảng worker_attendances
CREATE TABLE "worker_attendances" (
  "id"            UUID NOT NULL,
  "worker_id"     UUID NOT NULL,
  "project_id"    UUID NOT NULL,
  "date"          DATE NOT NULL,
  "session"       "WorkerAttendanceSession" NOT NULL,
  "present"       BOOLEAN NOT NULL DEFAULT false,
  "marked_by_id"  UUID NOT NULL,
  "marked_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "worker_attendances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "worker_attendances_worker_id_fkey"    FOREIGN KEY ("worker_id")    REFERENCES "workers"("id")  ON DELETE CASCADE,
  CONSTRAINT "worker_attendances_project_id_fkey"   FOREIGN KEY ("project_id")   REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "worker_attendances_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "users"("id")    ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "worker_attendances_worker_id_date_session_key" ON "worker_attendances"("worker_id", "date", "session");
CREATE INDEX "worker_attendances_project_id_date_session_idx" ON "worker_attendances"("project_id", "date", "session");
