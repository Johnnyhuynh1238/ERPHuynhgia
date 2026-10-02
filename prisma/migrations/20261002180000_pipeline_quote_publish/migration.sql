ALTER TABLE "project_pipeline_versions" ADD COLUMN "quote_published_at" TIMESTAMP(3);
ALTER TABLE "project_pipeline_versions" ADD COLUMN "cost_html" TEXT;
ALTER TABLE "project_pipeline_versions" ADD COLUMN "cost_updated_at" TIMESTAMP(3);
ALTER TABLE "project_pipeline_versions" ADD COLUMN "cost_total" DECIMAL(18,0);
