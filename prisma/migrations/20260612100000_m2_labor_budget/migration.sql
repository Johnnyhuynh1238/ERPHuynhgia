-- M2: Dự toán nhân công công trình
-- Enums LaborPhase / BudgetStatus / AmendmentStatus + 4 bảng

DO $$ BEGIN
  CREATE TYPE "LaborPhase" AS ENUM ('mong', 'than', 'mai');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BudgetStatus" AS ENUM ('draft', 'locked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AmendmentStatus" AS ENUM ('draft', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- labor_budgets: 1-1 với project
CREATE TABLE IF NOT EXISTS "labor_budgets" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"    UUID NOT NULL UNIQUE,
  "status"        "BudgetStatus" NOT NULL DEFAULT 'draft',
  "total_amount"  BIGINT NOT NULL DEFAULT 0,
  "note"          TEXT,
  "created_by_id" UUID NOT NULL,
  "locked_by_id"  UUID,
  "locked_at"     TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "labor_budgets_project_fk"   FOREIGN KEY ("project_id")    REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "labor_budgets_created_fk"   FOREIGN KEY ("created_by_id") REFERENCES "users"("id"),
  CONSTRAINT "labor_budgets_locked_fk"    FOREIGN KEY ("locked_by_id")  REFERENCES "users"("id")
);

CREATE INDEX IF NOT EXISTS "labor_budgets_status_idx" ON "labor_budgets"("status");

-- labor_budget_items
CREATE TABLE IF NOT EXISTS "labor_budget_items" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_id"  UUID NOT NULL,
  "phase"      "LaborPhase" NOT NULL,
  "work_item"  TEXT NOT NULL,
  "unit"       VARCHAR(20) NOT NULL,
  "quantity"   DECIMAL(14, 3) NOT NULL,
  "unit_price" BIGINT NOT NULL,
  "amount"     BIGINT NOT NULL,
  "note"       TEXT,
  "sort_rank"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "labor_budget_items_budget_fk" FOREIGN KEY ("budget_id") REFERENCES "labor_budgets"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "labor_budget_items_budget_phase_idx" ON "labor_budget_items"("budget_id", "phase");

-- budget_amendments
CREATE TABLE IF NOT EXISTS "budget_amendments" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_id"      UUID NOT NULL,
  "reason"         TEXT NOT NULL,
  "delta_amount"   BIGINT NOT NULL DEFAULT 0,
  "status"         "AmendmentStatus" NOT NULL DEFAULT 'draft',
  "proposed_by_id" UUID NOT NULL,
  "approved_by_id" UUID,
  "approved_at"    TIMESTAMP(3),
  "reject_reason"  TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_amendments_budget_fk"   FOREIGN KEY ("budget_id")      REFERENCES "labor_budgets"("id") ON DELETE CASCADE,
  CONSTRAINT "budget_amendments_proposer_fk" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id"),
  CONSTRAINT "budget_amendments_approver_fk" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
);

CREATE INDEX IF NOT EXISTS "budget_amendments_budget_status_idx" ON "budget_amendments"("budget_id", "status");

-- budget_amendment_items
CREATE TABLE IF NOT EXISTS "budget_amendment_items" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "amendment_id" UUID NOT NULL,
  "phase"        "LaborPhase" NOT NULL,
  "work_item"    TEXT NOT NULL,
  "unit"         VARCHAR(20) NOT NULL,
  "quantity"     DECIMAL(14, 3) NOT NULL,
  "unit_price"   BIGINT NOT NULL,
  "amount"       BIGINT NOT NULL,
  "note"         TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_amendment_items_amendment_fk" FOREIGN KEY ("amendment_id") REFERENCES "budget_amendments"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "budget_amendment_items_amendment_phase_idx" ON "budget_amendment_items"("amendment_id", "phase");
