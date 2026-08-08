-- Ngân sách dòng tiền theo hạng mục (khoá được) + gắn hạng mục vào phiếu chi / sổ quỹ.

CREATE TYPE "BudgetPlanStatus" AS ENUM ('draft', 'locked');
CREATE TYPE "BudgetPlanGroup" AS ENUM ('tho', 'hoan_thien', 'nhan_cong', 'chung');

CREATE TABLE "project_budget_plans" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id"    UUID NOT NULL,
  "status"        "BudgetPlanStatus" NOT NULL DEFAULT 'draft',
  "total_amount"  BIGINT NOT NULL DEFAULT 0,
  "note"          TEXT,
  "created_by_id" UUID NOT NULL,
  "locked_by_id"  UUID,
  "locked_at"     TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_budget_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_budget_plans_project_id_key" ON "project_budget_plans"("project_id");
CREATE INDEX "project_budget_plans_status_idx" ON "project_budget_plans"("status");

CREATE TABLE "project_budget_plan_lines" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"    UUID NOT NULL,
  "name"       TEXT NOT NULL,
  "group_kind" "BudgetPlanGroup" NOT NULL DEFAULT 'tho',
  "amount"     BIGINT NOT NULL DEFAULT 0,
  "sort_rank"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_budget_plan_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_budget_plan_lines_plan_id_idx" ON "project_budget_plan_lines"("plan_id");

ALTER TABLE "project_budget_plans"
  ADD CONSTRAINT "project_budget_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "project_budget_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "project_budget_plans_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_budget_plan_lines"
  ADD CONSTRAINT "project_budget_plan_lines_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "project_budget_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Gắn hạng mục vào phiếu chi + sổ quỹ (để thống kê đã chi per hạng mục).
ALTER TABLE "expenses" ADD COLUMN "budget_line_id" UUID;
CREATE INDEX "expenses_budget_line_id_idx" ON "expenses"("budget_line_id");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_budget_line_id_fkey" FOREIGN KEY ("budget_line_id") REFERENCES "project_budget_plan_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cash_transactions" ADD COLUMN "budget_line_id" UUID;
CREATE INDEX "cash_transactions_budget_line_id_idx" ON "cash_transactions"("budget_line_id");
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_budget_line_id_fkey" FOREIGN KEY ("budget_line_id") REFERENCES "project_budget_plan_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- HĐ thầu phụ gắn hạng mục thi công.
ALTER TABLE "sub_contracts" ADD COLUMN "budget_line_id" UUID;
CREATE INDEX "sub_contracts_budget_line_id_idx" ON "sub_contracts"("budget_line_id");
ALTER TABLE "sub_contracts" ADD CONSTRAINT "sub_contracts_budget_line_id_fkey" FOREIGN KEY ("budget_line_id") REFERENCES "project_budget_plan_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
