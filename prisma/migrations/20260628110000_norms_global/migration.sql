-- M2 v4: Định mức GLOBAL (SOP 47) — bỏ per-project Norm, tạo global Norm, gắn vào công tác qua norm_code

-- Drop per-project norm table (chưa có data thực)
DROP TABLE IF EXISTS "project_budget_norms";

-- Tạo bảng norms global
CREATE TABLE "norms" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"           VARCHAR(32) NOT NULL UNIQUE,
  "name"           TEXT NOT NULL,
  "unit"           VARCHAR(20) NOT NULL,
  "category"       VARCHAR(64),
  "material_items" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "labor_items"    JSONB NOT NULL DEFAULT '[]'::jsonb,
  "machine_items"  JSONB NOT NULL DEFAULT '[]'::jsonb,
  "k_material"     DECIMAL(8, 4) NOT NULL DEFAULT 1,
  "k_labor"        DECIMAL(8, 4) NOT NULL DEFAULT 1,
  "k_machine"      DECIMAL(8, 4) NOT NULL DEFAULT 1,
  "source"         VARCHAR(255),
  "note"           TEXT,
  "retired_at"     TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "norms_category_idx" ON "norms"("category");
CREATE INDEX "norms_retired_at_idx" ON "norms"("retired_at");

-- Thêm norm_code vào project_budget_items
ALTER TABLE "project_budget_items"
  ADD COLUMN "norm_code" VARCHAR(32);

CREATE INDEX "project_budget_items_norm_code_idx" ON "project_budget_items"("norm_code");

ALTER TABLE "project_budget_items"
  ADD CONSTRAINT "project_budget_items_norm_code_fkey"
  FOREIGN KEY ("norm_code") REFERENCES "norms"("code") ON DELETE SET NULL ON UPDATE CASCADE;
