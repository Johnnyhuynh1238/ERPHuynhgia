-- M2 v2: Dự toán công trình (Nhân công + Vật tư + Máy móc)
-- Enums + 4 bảng project_budget*

DO $$ BEGIN
  CREATE TYPE "BudgetCategory" AS ENUM ('labor', 'material', 'equipment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BudgetPhase" AS ENUM ('mong', 'than', 'mai');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BudgetStatus" AS ENUM ('draft', 'locked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AmendmentStatus" AS ENUM ('draft', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- project_budgets: 1-1 với project
CREATE TABLE IF NOT EXISTS "project_budgets" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"      UUID NOT NULL UNIQUE,
  "status"          "BudgetStatus" NOT NULL DEFAULT 'draft',
  "total_labor"     BIGINT NOT NULL DEFAULT 0,
  "total_material"  BIGINT NOT NULL DEFAULT 0,
  "total_equipment" BIGINT NOT NULL DEFAULT 0,
  "total_amount"    BIGINT NOT NULL DEFAULT 0,
  "note"            TEXT,
  "created_by_id"   UUID NOT NULL,
  "locked_by_id"    UUID,
  "locked_at"       TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_budgets_project_fk" FOREIGN KEY ("project_id")    REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "project_budgets_created_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id"),
  CONSTRAINT "project_budgets_locked_fk"  FOREIGN KEY ("locked_by_id")  REFERENCES "users"("id")
);

CREATE INDEX IF NOT EXISTS "project_budgets_status_idx" ON "project_budgets"("status");

-- project_budget_items
CREATE TABLE IF NOT EXISTS "project_budget_items" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_id"  UUID NOT NULL,
  "category"   "BudgetCategory" NOT NULL,
  "phase"      "BudgetPhase" NOT NULL,
  "name"       TEXT NOT NULL,
  "unit"       VARCHAR(20) NOT NULL,
  "quantity"   DECIMAL(14, 3) NOT NULL,
  "unit_price" BIGINT NOT NULL,
  "amount"     BIGINT NOT NULL,
  "note"       TEXT,
  "sort_rank"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_budget_items_budget_fk" FOREIGN KEY ("budget_id") REFERENCES "project_budgets"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "project_budget_items_budget_cat_phase_idx" ON "project_budget_items"("budget_id", "category", "phase");

-- project_budget_amendments
CREATE TABLE IF NOT EXISTS "project_budget_amendments" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_id"       UUID NOT NULL,
  "reason"          TEXT NOT NULL,
  "delta_labor"     BIGINT NOT NULL DEFAULT 0,
  "delta_material"  BIGINT NOT NULL DEFAULT 0,
  "delta_equipment" BIGINT NOT NULL DEFAULT 0,
  "delta_amount"    BIGINT NOT NULL DEFAULT 0,
  "status"          "AmendmentStatus" NOT NULL DEFAULT 'draft',
  "proposed_by_id"  UUID NOT NULL,
  "approved_by_id"  UUID,
  "approved_at"     TIMESTAMP(3),
  "reject_reason"   TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_budget_amendments_budget_fk"   FOREIGN KEY ("budget_id")      REFERENCES "project_budgets"("id") ON DELETE CASCADE,
  CONSTRAINT "project_budget_amendments_proposer_fk" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id"),
  CONSTRAINT "project_budget_amendments_approver_fk" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
);

CREATE INDEX IF NOT EXISTS "project_budget_amendments_budget_status_idx" ON "project_budget_amendments"("budget_id", "status");

-- project_budget_amendment_items
CREATE TABLE IF NOT EXISTS "project_budget_amendment_items" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "amendment_id" UUID NOT NULL,
  "category"     "BudgetCategory" NOT NULL,
  "phase"        "BudgetPhase" NOT NULL,
  "name"         TEXT NOT NULL,
  "unit"         VARCHAR(20) NOT NULL,
  "quantity"     DECIMAL(14, 3) NOT NULL,
  "unit_price"   BIGINT NOT NULL,
  "amount"       BIGINT NOT NULL,
  "note"         TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_budget_amendment_items_amendment_fk" FOREIGN KEY ("amendment_id") REFERENCES "project_budget_amendments"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "project_budget_amendment_items_amendment_cat_phase_idx" ON "project_budget_amendment_items"("amendment_id", "category", "phase");
