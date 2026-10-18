-- KS nhận nhiệm vụ hằng ngày qua link Zalo: thread Zalo 1-1 của KS + bảng nhiệm vụ (số thợ sáng / báo cáo cuối ngày)
ALTER TABLE "users" ADD COLUMN "zalo_thread_id" TEXT;
CREATE UNIQUE INDEX "users_zalo_thread_id_key" ON "users"("zalo_thread_id");

CREATE TABLE "ks_daily_reports" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "ks_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "worker_count" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "asked_at" TIMESTAMP(3),
    "reminded_at" TIMESTAMP(3),
    "answered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ks_daily_reports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ks_daily_reports_project_id_report_date_kind_key" ON "ks_daily_reports"("project_id", "report_date", "kind");
CREATE INDEX "ks_daily_reports_ks_id_report_date_kind_idx" ON "ks_daily_reports"("ks_id", "report_date", "kind");
ALTER TABLE "ks_daily_reports" ADD CONSTRAINT "ks_daily_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ks_daily_reports" ADD CONSTRAINT "ks_daily_reports_ks_id_fkey" FOREIGN KEY ("ks_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
