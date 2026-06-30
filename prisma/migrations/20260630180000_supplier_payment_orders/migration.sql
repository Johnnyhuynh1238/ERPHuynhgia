-- Enum trạng thái lệnh thanh toán NCC.
CREATE TYPE "SupplierPaymentOrderStatus" AS ENUM (
  'pending',
  'approved',
  'paid',
  'rejected',
  'cancelled'
);

-- Lệnh thanh toán: KT tạo, Admin duyệt, KT chi.
CREATE TABLE "supplier_payment_orders" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"           TEXT NOT NULL,
  "supplier_id"    UUID NOT NULL,
  "total_amount"   NUMERIC(18, 2) NOT NULL,
  "status"         "SupplierPaymentOrderStatus" NOT NULL DEFAULT 'pending',
  "payment_method" TEXT,
  "note"           TEXT,

  "created_by"     UUID NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "approved_by"    UUID,
  "approved_at"    TIMESTAMP(3),
  "approval_note"  TEXT,

  "rejected_by"    UUID,
  "rejected_at"    TIMESTAMP(3),
  "rejection_note" TEXT,

  "paid_by"        UUID,
  "paid_at"        TIMESTAMP(3),
  "account_id"     UUID,

  "cancelled_at"   TIMESTAMP(3),

  CONSTRAINT "supplier_payment_orders_supplier_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_payment_orders_account_fkey"
    FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "supplier_payment_orders_creator_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "supplier_payment_orders_approver_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "supplier_payment_orders_rejecter_fkey"
    FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "supplier_payment_orders_payer_fkey"
    FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "supplier_payment_orders_code_key"
  ON "supplier_payment_orders"("code");

CREATE INDEX "supplier_payment_orders_supplier_id_status_idx"
  ON "supplier_payment_orders"("supplier_id", "status");

CREATE INDEX "supplier_payment_orders_status_created_at_idx"
  ON "supplier_payment_orders"("status", "created_at" DESC);

-- Item của lệnh thanh toán (1 lệnh có nhiều món; 1 món chỉ active trong 1 lệnh tại 1 thời điểm).
CREATE TABLE "supplier_payment_order_items" (
  "id"       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "debt_id"  UUID NOT NULL,
  "amount"   NUMERIC(18, 2) NOT NULL,

  CONSTRAINT "supplier_payment_order_items_order_fkey"
    FOREIGN KEY ("order_id") REFERENCES "supplier_payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "supplier_payment_order_items_debt_fkey"
    FOREIGN KEY ("debt_id") REFERENCES "material_proposal_item_debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "supplier_payment_order_items_order_id_idx"
  ON "supplier_payment_order_items"("order_id");

CREATE INDEX "supplier_payment_order_items_debt_id_idx"
  ON "supplier_payment_order_items"("debt_id");

-- Push notifications cho lệnh thanh toán NCC.
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'supplier_payment_order_new';
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'supplier_payment_order_decision';
