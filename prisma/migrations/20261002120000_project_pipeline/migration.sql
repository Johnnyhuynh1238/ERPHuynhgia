-- Dự án theo tiến độ 6 giai đoạn (Mô tả → Báo giá → Hợp đồng → Thiết kế → Thi công → Bàn giao).
-- Giai đoạn 1 lưu trang mô tả HTML gửi khách (huynhgia6.com/<slug>).
CREATE TABLE "project_pipelines" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT,
    "address" TEXT,
    "slug" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "stage_dates" JSONB NOT NULL DEFAULT '{}',
    "description_html" TEXT,
    "description_updated_at" TIMESTAMP(3),
    "project_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pipelines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_pipelines_slug_key" ON "project_pipelines"("slug");
CREATE UNIQUE INDEX "project_pipelines_project_id_key" ON "project_pipelines"("project_id");
CREATE INDEX "project_pipelines_stage_idx" ON "project_pipelines"("stage");

ALTER TABLE "project_pipelines" ADD CONSTRAINT "project_pipelines_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
