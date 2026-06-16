-- CreateEnum
CREATE TYPE "TptcDailyStatusKind" AS ENUM ('working_on_today', 'not_today');

-- CreateTable
CREATE TABLE "tptc_assignment_daily_statuses" (
    "id" UUID NOT NULL,
    "tptc_assignment_id" UUID NOT NULL,
    "ks_user_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "status" "TptcDailyStatusKind" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tptc_assignment_daily_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tptc_assignment_daily_statuses_tptc_assignment_id_report_da_key" ON "tptc_assignment_daily_statuses"("tptc_assignment_id", "report_date");

-- CreateIndex
CREATE INDEX "tptc_assignment_daily_statuses_ks_user_id_report_date_idx" ON "tptc_assignment_daily_statuses"("ks_user_id", "report_date");

-- CreateIndex
CREATE INDEX "tptc_assignment_daily_statuses_report_date_idx" ON "tptc_assignment_daily_statuses"("report_date");

-- AddForeignKey
ALTER TABLE "tptc_assignment_daily_statuses" ADD CONSTRAINT "tptc_assignment_daily_statuses_tptc_assignment_id_fkey" FOREIGN KEY ("tptc_assignment_id") REFERENCES "tptc_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tptc_assignment_daily_statuses" ADD CONSTRAINT "tptc_assignment_daily_statuses_ks_user_id_fkey" FOREIGN KEY ("ks_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
