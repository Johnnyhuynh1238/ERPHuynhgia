-- M8 — Sổ quỹ + Lệnh chi tổng quát
-- 4 model: CompanyCash (singleton), CashTransaction, ExpenseCategory, Expense
-- + thêm paid_amount cho material_proposals để hook proposal mark_paid → CashTransaction

-- CreateEnum
CREATE TYPE "CashTxnDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "CashTxnRefType" AS ENUM ('opening', 'expense', 'sub_payment', 'material_proposal', 'payment_schedule');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('pending', 'paid', 'cancelled');

-- AlterTable
ALTER TABLE "material_proposals" ADD COLUMN "paid_amount" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "company_cash" (
    "id" UUID NOT NULL,
    "opening_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "opening_date" DATE,
    "opening_note" TEXT,
    "opening_set_by" UUID,
    "opening_set_at" TIMESTAMP(3),
    "current_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "last_txn_at" TIMESTAMP(3),
    "initialized" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_cash_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "project_id" UUID,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payee" TEXT,
    "payment_method" TEXT,
    "note" TEXT,
    "attachment_url" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'pending',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_by" UUID,
    "paid_at" TIMESTAMP(3),
    "paid_amount" DECIMAL(18,2),
    "paid_note" TEXT,
    "paid_receipt_url" TEXT,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_reason" TEXT,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" UUID NOT NULL,
    "direction" "CashTxnDirection" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "ref_type" "CashTxnRefType" NOT NULL,
    "ref_id" UUID,
    "project_id" UUID,
    "category_id" UUID,
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_code_key" ON "expense_categories"("code");

-- CreateIndex
CREATE INDEX "expense_categories_active_sort_order_idx" ON "expense_categories"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_code_key" ON "expenses"("code");

-- CreateIndex
CREATE INDEX "expenses_status_created_at_idx" ON "expenses"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "expenses_project_id_created_at_idx" ON "expenses"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "expenses_category_id_created_at_idx" ON "expenses"("category_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "cash_transactions_occurred_at_idx" ON "cash_transactions"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "cash_transactions_ref_type_ref_id_idx" ON "cash_transactions"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "cash_transactions_project_id_occurred_at_idx" ON "cash_transactions"("project_id", "occurred_at");

-- CreateIndex
CREATE INDEX "cash_transactions_category_id_occurred_at_idx" ON "cash_transactions"("category_id", "occurred_at");

-- CreateIndex
CREATE INDEX "cash_transactions_created_at_idx" ON "cash_transactions"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "company_cash" ADD CONSTRAINT "company_cash_opening_set_by_fkey" FOREIGN KEY ("opening_set_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Seed 8 danh mục chi mặc định
INSERT INTO "expense_categories" ("id", "code", "name", "sort_order", "active", "created_at", "updated_at") VALUES
    (gen_random_uuid(), 'VATTU',     'Vật tư (ngoài đề xuất KS)', 10, true, NOW(), NOW()),
    (gen_random_uuid(), 'MAYMOC',    'Máy móc / thiết bị',         20, true, NOW(), NOW()),
    (gen_random_uuid(), 'XANGDAU',   'Nhiên liệu / xăng dầu',      30, true, NOW(), NOW()),
    (gen_random_uuid(), 'VANPHONG',  'Văn phòng / internet',       40, true, NOW(), NOW()),
    (gen_random_uuid(), 'TIEPKHACH', 'Tiếp khách',                  50, true, NOW(), NOW()),
    (gen_random_uuid(), 'LUONGQL',   'Lương quản lý / nhân sự',    60, true, NOW(), NOW()),
    (gen_random_uuid(), 'THUE',      'Thuế / lệ phí',               70, true, NOW(), NOW()),
    (gen_random_uuid(), 'KHAC',      'Khác',                        99, true, NOW(), NOW());

-- Khởi tạo singleton CompanyCash với số dư thực tế tại ngày 2026-06-24 do admin chốt.
-- Không qua UI khởi tạo; set thẳng ở migration để go-live có số dư đúng ngay.
DO $$
DECLARE
    v_cash_id UUID := gen_random_uuid();
    v_admin_id UUID := (
        SELECT id FROM users
        WHERE role = 'admin' AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1
    );
    v_amount NUMERIC(18, 2) := 25457560;
    v_opening_date DATE := DATE '2026-06-24';
    v_now TIMESTAMP(3) := NOW();
BEGIN
    INSERT INTO "company_cash" (
        "id", "opening_balance", "opening_date", "opening_note",
        "opening_set_by", "opening_set_at",
        "current_balance", "last_txn_at", "initialized", "updated_at"
    ) VALUES (
        v_cash_id, v_amount, v_opening_date, 'Số dư đầu kỳ — admin chốt cứng tại migration go-live',
        v_admin_id, v_now,
        v_amount, v_now, true, v_now
    );

    -- Ghi 1 dòng cash_txn "opening" để nhật ký quỹ có dòng mở đầu
    IF v_admin_id IS NOT NULL THEN
        INSERT INTO "cash_transactions" (
            "id", "direction", "amount", "occurred_at", "balance_after",
            "ref_type", "ref_id", "project_id", "category_id",
            "note", "created_by", "created_at"
        ) VALUES (
            gen_random_uuid(), 'in', v_amount, v_opening_date::timestamp, v_amount,
            'opening', NULL, NULL, NULL,
            'Khởi tạo số dư đầu kỳ', v_admin_id, v_now
        );
    END IF;
END $$;
