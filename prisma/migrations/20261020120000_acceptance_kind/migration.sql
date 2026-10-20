-- Phân loại mốc nghiệm thu: chủ nhà (hiện cổng CN) / thầu phụ (KS nghiệm thu đội khoán, nội bộ).
ALTER TABLE "acceptance_milestones" ADD COLUMN IF NOT EXISTS "kind" VARCHAR(20) NOT NULL DEFAULT 'chu_nha';
