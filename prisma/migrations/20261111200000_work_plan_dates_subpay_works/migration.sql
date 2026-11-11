-- Ngày kế hoạch riêng từng công tác + gắn công tác vào đợt thầu phụ (tiến độ = gốc ngày, sếp 11/11/2026).
ALTER TABLE "estimate_works" ADD COLUMN IF NOT EXISTS "plan_start" DATE;
ALTER TABLE "estimate_works" ADD COLUMN IF NOT EXISTS "plan_end" DATE;
ALTER TABLE "sub_payments" ADD COLUMN IF NOT EXISTS "work_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
