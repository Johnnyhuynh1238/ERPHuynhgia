-- M2 v3: Mô hình dự toán theo cấu kiện (SOP-47)
-- Additive — không drop cột cũ; code cũ vẫn chạy.

-- CreateEnum
CREATE TYPE "BudgetStage" AS ENUM ('CB', 'N', 'T', 'HT');

-- CreateTable: Cấu kiện vật lý (móng, cột T1, tường bao T2…)
CREATE TABLE "project_components" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "stage" "BudgetStage" NOT NULL,
    "name" TEXT NOT NULL,
    "floor" VARCHAR(8),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_components_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_components_project_id_stage_sort_order_idx"
    ON "project_components"("project_id", "stage", "sort_order");

ALTER TABLE "project_components"
    ADD CONSTRAINT "project_components_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Thêm cột mới cho ProjectBudgetItem (cấu kiện-centric)
ALTER TABLE "project_budget_items"
    ADD COLUMN "component_id" UUID,
    ADD COLUMN "stage" "BudgetStage",
    ADD COLUMN "labor_unit_price" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "labor_amount" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "material_unit_price" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "material_amount" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "equipment_unit_price" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "equipment_amount" BIGINT NOT NULL DEFAULT 0;

CREATE INDEX "project_budget_items_component_id_idx"
    ON "project_budget_items"("component_id");

CREATE INDEX "project_budget_items_budget_id_stage_idx"
    ON "project_budget_items"("budget_id", "stage");

ALTER TABLE "project_budget_items"
    ADD CONSTRAINT "project_budget_items_component_id_fkey"
    FOREIGN KEY ("component_id") REFERENCES "project_components"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
