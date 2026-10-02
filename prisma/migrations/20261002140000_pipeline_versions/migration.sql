-- Phiên bản mô tả + báo giá cho dự án pipeline: mô tả Vn đi với báo giá Vn (cùng số),
-- hợp đồng chốt theo báo giá phiên bản nào thì ghi ở project_pipelines.contract_version_no.
CREATE TABLE "project_pipeline_versions" (
    "id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "note" TEXT,
    "description_html" TEXT,
    "description_updated_at" TIMESTAMP(3),
    "quote_html" TEXT,
    "quote_updated_at" TIMESTAMP(3),
    "quote_total" DECIMAL(18,0),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pipeline_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_pipeline_versions_pipeline_id_version_no_key"
    ON "project_pipeline_versions"("pipeline_id", "version_no");

ALTER TABLE "project_pipeline_versions" ADD CONSTRAINT "project_pipeline_versions_pipeline_id_fkey"
    FOREIGN KEY ("pipeline_id") REFERENCES "project_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_pipelines" ADD COLUMN "contract_version_no" INTEGER;

-- Mô tả hiện có của từng dự án → phiên bản V1 (cột cũ trên project_pipelines giữ lại, không dùng nữa).
INSERT INTO "project_pipeline_versions"
    ("id", "pipeline_id", "version_no", "description_html", "description_updated_at", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", 1, "description_html", "description_updated_at", "created_at", CURRENT_TIMESTAMP
FROM "project_pipelines";
