-- M1: Worker grade + KPI foundation
-- Adds WorkerStatus/GradeHistoryStatus enums, extends Worker, adds WorkerDoc/GradeRate/GradeHistory.

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('trial', 'active', 'standby', 'inactive', 'blacklist');

-- CreateEnum
CREATE TYPE "GradeHistoryStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable: extend workers
ALTER TABLE "workers"
  ALTER COLUMN "project_id" DROP NOT NULL,
  ADD COLUMN "cccd" VARCHAR(20),
  ADD COLUMN "bank_account" VARCHAR(30),
  ADD COLUMN "bank_name" TEXT,
  ADD COLUMN "grade" INTEGER,
  ADD COLUMN "worker_status" "WorkerStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN "onboarded_at" TIMESTAMP(3),
  ADD COLUMN "rating" DOUBLE PRECISION,
  ADD COLUMN "notes" TEXT;

-- CreateIndex
CREATE INDEX "workers_worker_status_grade_idx" ON "workers"("worker_status", "grade");

-- CreateTable: worker_docs
CREATE TABLE "worker_docs" (
    "id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "worker_docs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worker_docs_worker_id_kind_idx" ON "worker_docs"("worker_id", "kind");

-- CreateTable: grade_rates
CREATE TABLE "grade_rates" (
    "id" UUID NOT NULL,
    "grade" INTEGER NOT NULL,
    "daily_rate" INTEGER NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grade_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grade_rates_grade_is_current_idx" ON "grade_rates"("grade", "is_current");

-- CreateTable: grade_history
CREATE TABLE "grade_history" (
    "id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "from_grade" INTEGER,
    "to_grade" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_url" TEXT,
    "status" "GradeHistoryStatus" NOT NULL DEFAULT 'pending',
    "proposed_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grade_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grade_history_worker_id_created_at_idx" ON "grade_history"("worker_id", "created_at");
CREATE INDEX "grade_history_status_idx" ON "grade_history"("status");

-- AddForeignKey
ALTER TABLE "worker_docs" ADD CONSTRAINT "worker_docs_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worker_docs" ADD CONSTRAINT "worker_docs_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "grade_rates" ADD CONSTRAINT "grade_rates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "grade_history" ADD CONSTRAINT "grade_history_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_history" ADD CONSTRAINT "grade_history_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grade_history" ADD CONSTRAINT "grade_history_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed bậc thợ B1..B5 (420/450/500/550/600k VND), creator = first admin
INSERT INTO "grade_rates" ("id", "grade", "daily_rate", "effective_at", "version", "is_current", "note", "created_by_id", "created_at")
SELECT gen_random_uuid(), g.grade, g.rate, CURRENT_TIMESTAMP, 1, true, g.note, u.id, CURRENT_TIMESTAMP
FROM (VALUES
  (1, 420000, 'B1 - Phụ hồ'),
  (2, 450000, 'B2 - Thợ phụ'),
  (3, 500000, 'B3 - Thợ trung bình'),
  (4, 550000, 'B4 - Thợ cứng'),
  (5, 600000, 'B5 - Thợ giỏi')
) AS g(grade, rate, note)
CROSS JOIN LATERAL (SELECT id FROM "users" WHERE role = 'admin' ORDER BY created_at LIMIT 1) u
WHERE EXISTS (SELECT 1 FROM "users" WHERE role = 'admin');
