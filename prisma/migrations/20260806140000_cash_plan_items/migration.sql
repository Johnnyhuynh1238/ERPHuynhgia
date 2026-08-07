-- Kế hoạch thu/chi (dòng tiền). Bảng chỉ giữ các đợt admin tự chia + khoản nhập tay.
-- Nguồn có ngày gốc (thầu phụ, đợt thu HĐ, mua hàng delivery_date) đọc thẳng, không lưu ở đây.

-- ── 1. Enums ─────────────────────────────────────────────────────────────────
CREATE TYPE "CashPlanDirection" AS ENUM ('out', 'in');
CREATE TYPE "CashPlanSourceType" AS ENUM ('mh_order', 'loan_principal', 'loan_interest', 'salary', 'advance', 'manual');
CREATE TYPE "CashPlanStatus" AS ENUM ('planned', 'done', 'cancelled');

-- ── 2. Bảng cash_plan_items ──────────────────────────────────────────────────
CREATE TABLE "cash_plan_items" (
  "id"           UUID                 NOT NULL DEFAULT gen_random_uuid(),
  "direction"    "CashPlanDirection"  NOT NULL,
  "source_type"  "CashPlanSourceType" NOT NULL,
  "source_id"    UUID,
  "project_id"   UUID,
  "planned_date" DATE,
  "amount"       DECIMAL(18, 2)       NOT NULL,
  "title"        TEXT,
  "note"         TEXT,
  "status"         "CashPlanStatus"   NOT NULL DEFAULT 'planned',
  "recur_group_id" UUID,
  "created_by"   UUID                 NOT NULL,
  "created_at"   TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3)         NOT NULL,
  CONSTRAINT "cash_plan_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cash_plan_items_direction_planned_date_idx" ON "cash_plan_items"("direction", "planned_date");
CREATE INDEX "cash_plan_items_source_type_source_id_idx"  ON "cash_plan_items"("source_type", "source_id");
CREATE INDEX "cash_plan_items_project_id_idx"             ON "cash_plan_items"("project_id");
CREATE INDEX "cash_plan_items_recur_group_id_idx"         ON "cash_plan_items"("recur_group_id");

ALTER TABLE "cash_plan_items" ADD CONSTRAINT "cash_plan_items_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "cash_plan_items" ADD CONSTRAINT "cash_plan_items_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
