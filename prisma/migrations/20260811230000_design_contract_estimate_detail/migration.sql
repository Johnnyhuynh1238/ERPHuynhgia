-- Dự toán chi tiết (có bản vẽ) gắn HĐ thiết kế
ALTER TABLE "design_contracts"
  ADD COLUMN IF NOT EXISTS "estimate_detail" JSONB NOT NULL DEFAULT '{}'::jsonb;
