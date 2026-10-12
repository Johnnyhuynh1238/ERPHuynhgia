-- Link mời thầu nhân công huynhgia6.com/moi-thau-<mã>: bản vẽ + phối cảnh + mô tả + HĐ mẫu, chỉ xem.
ALTER TABLE "project_pipelines" ADD COLUMN "bid_slug" TEXT;
ALTER TABLE "project_pipelines" ADD COLUMN "bid_published_at" TIMESTAMP(3);
ALTER TABLE "project_pipelines" ADD COLUMN "bid_note" TEXT;
ALTER TABLE "project_pipelines" ADD COLUMN "bid_doc_keys" JSONB NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX "project_pipelines_bid_slug_key" ON "project_pipelines"("bid_slug");
