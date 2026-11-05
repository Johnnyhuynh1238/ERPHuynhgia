-- Kế hoạch dòng tiền DỰ ÁN (GĐ 5 Chuẩn bị, sếp chốt 05/11/2026): dự báo chi/thu trước khi phát sinh đơn hàng,
-- sinh từ dự toán + tiến độ dự kiến + điều khoản thanh toán NCC. Bản tin dòng tiền công ty đọc từ đây.

-- ── 1. Enums ─────────────────────────────────────────────────────────────────
CREATE TYPE "CashTerm" AS ENUM ('no_ngay', 'tra_ngay', 'sau_nghiem_thu');
CREATE TYPE "CashLineKind" AS ENUM ('vat_tu', 'nhan_cong', 'du_phong', 'khac');

-- ── 2. Điều khoản thanh toán NCC ─────────────────────────────────────────────
ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "payment_term" "CashTerm" NOT NULL DEFAULT 'no_ngay',
  ADD COLUMN IF NOT EXISTS "credit_days"  INTEGER    NOT NULL DEFAULT 14;

-- ── 3. project_cash_plans (1 dự án 1 bản) ────────────────────────────────────
CREATE TABLE "project_cash_plans" (
  "id"                 UUID               NOT NULL DEFAULT gen_random_uuid(),
  "project_id"         UUID               NOT NULL,
  "status"             "BudgetPlanStatus" NOT NULL DEFAULT 'draft',
  "contingency_pct"    DECIMAL(5, 2)      NOT NULL DEFAULT 5,
  "receipt_delay_days" INTEGER            NOT NULL DEFAULT 4,
  "lead_days"          INTEGER            NOT NULL DEFAULT 3,
  "generated_at"       TIMESTAMP(3),
  "locked_at"          TIMESTAMP(3),
  "note"               TEXT,
  "created_at"         TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3)       NOT NULL,
  CONSTRAINT "project_cash_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_cash_plans_project_id_key" ON "project_cash_plans"("project_id");
ALTER TABLE "project_cash_plans"
  ADD CONSTRAINT "project_cash_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. project_cash_lines ────────────────────────────────────────────────────
CREATE TABLE "project_cash_lines" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"     UUID           NOT NULL,
  "project_id"  UUID           NOT NULL,
  "kind"        "CashLineKind" NOT NULL,
  "section_id"  UUID,
  "supplier_id" UUID,
  "group_key"   VARCHAR(80)    NOT NULL,
  "seq"         INTEGER        NOT NULL DEFAULT 1,
  "title"       TEXT           NOT NULL,
  "term"        "CashTerm"     NOT NULL DEFAULT 'no_ngay',
  "base_date"   DATE           NOT NULL,
  "due_date"    DATE           NOT NULL,
  "date_manual" BOOLEAN        NOT NULL DEFAULT false,
  "amount"      DECIMAL(18, 2) NOT NULL,
  "note"        TEXT,
  "sort_order"  INTEGER        NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "project_cash_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_cash_lines_plan_id_idx"              ON "project_cash_lines"("plan_id");
CREATE INDEX "project_cash_lines_project_id_due_date_idx"  ON "project_cash_lines"("project_id", "due_date");
CREATE INDEX "project_cash_lines_project_id_group_key_idx" ON "project_cash_lines"("project_id", "group_key");
ALTER TABLE "project_cash_lines"
  ADD CONSTRAINT "project_cash_lines_plan_id_fkey"     FOREIGN KEY ("plan_id")     REFERENCES "project_cash_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "project_cash_lines_project_id_fkey"  FOREIGN KEY ("project_id")  REFERENCES "projects"("id")           ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "project_cash_lines_section_id_fkey"  FOREIGN KEY ("section_id")  REFERENCES "project_sections"("id")   ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "project_cash_lines_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")          ON DELETE SET NULL ON UPDATE CASCADE;
