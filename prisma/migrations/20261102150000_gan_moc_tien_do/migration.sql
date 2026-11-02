-- Gán mốc (GĐ5): công tác tiến độ → mốc nghiệm thu (đến hạn) + đợt thu (đủ điều kiện thu).
ALTER TABLE "acceptance_milestones" ADD COLUMN IF NOT EXISTS "work_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "payment_schedules" ADD COLUMN IF NOT EXISTS "work_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "payment_schedules" ADD COLUMN IF NOT EXISTS "milestone_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "payment_schedules" ADD COLUMN IF NOT EXISTS "work_pct_required" SMALLINT NOT NULL DEFAULT 100;
