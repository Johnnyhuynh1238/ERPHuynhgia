-- Nhận định tài chính do AI soạn khi anh hỏi "update tình hình tài chính" → hiện đầu màn Tài chính tổng quan.
CREATE TABLE IF NOT EXISTS "finance_briefs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "as_of" DATE NOT NULL,
  "headline" TEXT NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_briefs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "finance_briefs_created_at_idx" ON "finance_briefs"("created_at");
