-- Add ME to BudgetStage enum
ALTER TYPE "BudgetStage" ADD VALUE IF NOT EXISTS 'ME';

-- Add directUnitPrice to project_budget_items
ALTER TABLE "project_budget_items"
  ADD COLUMN IF NOT EXISTS "direct_unit_price" BIGINT;

-- Create me_prices table
CREATE TABLE IF NOT EXISTS "me_prices" (
  "id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "unit" VARCHAR(20) NOT NULL,
  "price" BIGINT NOT NULL,
  "brand" VARCHAR(128),
  "category" VARCHAR(64),
  "source" VARCHAR(255),
  "note" TEXT,
  "retired_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "me_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "me_prices_name_unit_key" ON "me_prices"("name", "unit");
CREATE INDEX IF NOT EXISTS "me_prices_category_idx" ON "me_prices"("category");
CREATE INDEX IF NOT EXISTS "me_prices_retired_at_idx" ON "me_prices"("retired_at");
