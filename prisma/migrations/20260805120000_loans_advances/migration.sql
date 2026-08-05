-- Quản lý nợ / lãi / tạm ứng / hoàn ứng.
-- 1) Danh mục chi "Trả nợ gốc" (LAIVAY + TAMUNG đã có sẵn).
-- 2) Bảng loans (khoản vay) + advances (tạm ứng), cấp công ty, không gắn dự án.
-- 3) Cột loan_id / advance_id trên expenses + receipts để gắn giao dịch vào khoản.

-- ── 1. Danh mục chi "Trả nợ gốc" ─────────────────────────────────────────────
INSERT INTO "expense_categories" (id, code, name, sort_order, scope, active, created_at, updated_at)
VALUES (gen_random_uuid(), 'TRANOGOC', 'Trả nợ gốc', 49, 'company', true, now(), now())
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, scope = EXCLUDED.scope, sort_order = EXCLUDED.sort_order, active = true;

-- ── 2. Enums ─────────────────────────────────────────────────────────────────
CREATE TYPE "LoanStatus" AS ENUM ('active', 'paid');
CREATE TYPE "AdvanceStatus" AS ENUM ('open', 'settled');

-- ── 3. Bảng loans ────────────────────────────────────────────────────────────
CREATE TABLE "loans" (
  "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
  "code"          TEXT           NOT NULL,
  "lender"        TEXT           NOT NULL,
  "principal"     DECIMAL(18, 2) NOT NULL,
  "interest_rate" DECIMAL(8, 4),
  "disbursed_at"  TIMESTAMP(3),
  "due_date"      TIMESTAMP(3),
  "status"        "LoanStatus"   NOT NULL DEFAULT 'active',
  "note"          TEXT,
  "created_by"    UUID           NOT NULL,
  "created_at"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3)   NOT NULL,
  "closed_at"     TIMESTAMP(3),
  CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loans_code_key" ON "loans"("code");
CREATE INDEX "loans_status_created_at_idx" ON "loans"("status", "created_at" DESC);
ALTER TABLE "loans" ADD CONSTRAINT "loans_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── 4. Bảng advances ─────────────────────────────────────────────────────────
CREATE TABLE "advances" (
  "id"          UUID            NOT NULL DEFAULT gen_random_uuid(),
  "code"        TEXT            NOT NULL,
  "recipient"   TEXT            NOT NULL,
  "amount"      DECIMAL(18, 2)  NOT NULL,
  "advanced_at" TIMESTAMP(3),
  "purpose"     TEXT,
  "status"      "AdvanceStatus" NOT NULL DEFAULT 'open',
  "note"        TEXT,
  "created_by"  UUID            NOT NULL,
  "created_at"  TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3)    NOT NULL,
  "settled_at"  TIMESTAMP(3),
  CONSTRAINT "advances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "advances_code_key" ON "advances"("code");
CREATE INDEX "advances_status_created_at_idx" ON "advances"("status", "created_at" DESC);
ALTER TABLE "advances" ADD CONSTRAINT "advances_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── 5. Cột link trên expenses ────────────────────────────────────────────────
ALTER TABLE "expenses" ADD COLUMN "loan_id"    UUID;
ALTER TABLE "expenses" ADD COLUMN "advance_id" UUID;
CREATE INDEX "expenses_loan_id_idx"    ON "expenses"("loan_id");
CREATE INDEX "expenses_advance_id_idx" ON "expenses"("advance_id");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_loan_id_fkey"
  FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_advance_id_fkey"
  FOREIGN KEY ("advance_id") REFERENCES "advances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 6. Cột link trên receipts ────────────────────────────────────────────────
ALTER TABLE "receipts" ADD COLUMN "loan_id"    UUID;
ALTER TABLE "receipts" ADD COLUMN "advance_id" UUID;
CREATE INDEX "receipts_loan_id_idx"    ON "receipts"("loan_id");
CREATE INDEX "receipts_advance_id_idx" ON "receipts"("advance_id");
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_loan_id_fkey"
  FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_advance_id_fkey"
  FOREIGN KEY ("advance_id") REFERENCES "advances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
