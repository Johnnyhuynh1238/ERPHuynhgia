-- Migrate BudgetPhase 3 → 9 phaseCode khớp StandardTaskCatalog (SOP 47)
-- Thêm breakdown JSON cho công tác con

ALTER TABLE "project_budget_items"
  ADD COLUMN "phase_code" VARCHAR(2) NOT NULL DEFAULT '02',
  ADD COLUMN "breakdown" JSONB NULL;

-- Backfill phase_code từ phase enum cũ
-- mong → 02 (Phần ngầm – Móng)
-- than → 03 (Kết cấu BTCT phần thân) — admin remap qua UI sau cho các hạng mục thuộc 05/06/08
-- mai  → 04 (Phần mái)
UPDATE "project_budget_items" SET "phase_code" = '02' WHERE "phase" = 'mong';
UPDATE "project_budget_items" SET "phase_code" = '03' WHERE "phase" = 'than';
UPDATE "project_budget_items" SET "phase_code" = '04' WHERE "phase" = 'mai';

CREATE INDEX "project_budget_items_budget_cat_phase_code_idx"
  ON "project_budget_items" ("budget_id", "category", "phase_code");

ALTER TABLE "project_budget_amendment_items"
  ADD COLUMN "phase_code" VARCHAR(2) NOT NULL DEFAULT '02';

UPDATE "project_budget_amendment_items" SET "phase_code" = '02' WHERE "phase" = 'mong';
UPDATE "project_budget_amendment_items" SET "phase_code" = '03' WHERE "phase" = 'than';
UPDATE "project_budget_amendment_items" SET "phase_code" = '04' WHERE "phase" = 'mai';

CREATE INDEX "project_budget_amendment_items_amend_cat_phase_code_idx"
  ON "project_budget_amendment_items" ("amendment_id", "category", "phase_code");
