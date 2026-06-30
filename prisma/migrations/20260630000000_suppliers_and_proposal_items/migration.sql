-- Suppliers + per-item receipts/debts for material proposals
-- See models: Supplier, SupplierMaterialGroup, SupplierMaterialPrice,
-- MaterialProposalItemReceipt, MaterialProposalItemDebt.

-- 1. Add closedAt/closedBy to material_proposals
ALTER TABLE "material_proposals"
  ADD COLUMN "closed_at" TIMESTAMP(3),
  ADD COLUMN "closed_by" UUID;

ALTER TABLE "material_proposals"
  ADD CONSTRAINT "material_proposals_closed_by_fkey"
  FOREIGN KEY ("closed_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Suppliers
CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "alt_phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "tax_code" TEXT,
  "bank_name" TEXT,
  "bank_account" TEXT,
  "bank_account_name" TEXT,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");
CREATE INDEX "suppliers_is_active_name_idx" ON "suppliers"("is_active", "name");

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Supplier material groups
CREATE TABLE "supplier_material_groups" (
  "id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_material_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_material_groups_supplier_id_name_key"
  ON "supplier_material_groups"("supplier_id", "name");

ALTER TABLE "supplier_material_groups"
  ADD CONSTRAINT "supplier_material_groups_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Supplier material prices
CREATE TABLE "supplier_material_prices" (
  "id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "group_id" UUID,
  "material_name" TEXT NOT NULL,
  "unit" VARCHAR(50) NOT NULL,
  "supplier_item_code" TEXT,
  "unit_price" DECIMAL(18, 2) NOT NULL,
  "note" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" UUID,
  CONSTRAINT "supplier_material_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_material_prices_supplier_id_material_name_unit_key"
  ON "supplier_material_prices"("supplier_id", "material_name", "unit");
CREATE INDEX "supplier_material_prices_supplier_id_group_id_idx"
  ON "supplier_material_prices"("supplier_id", "group_id");

ALTER TABLE "supplier_material_prices"
  ADD CONSTRAINT "supplier_material_prices_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_material_prices"
  ADD CONSTRAINT "supplier_material_prices_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "supplier_material_groups"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_material_prices"
  ADD CONSTRAINT "supplier_material_prices_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Material proposal item receipts (KS nhận từng món)
CREATE TABLE "material_proposal_item_receipts" (
  "id" UUID NOT NULL,
  "proposal_id" UUID NOT NULL,
  "item_seq" INTEGER NOT NULL,
  "received_qty" DECIMAL(18, 3) NOT NULL,
  "qc_checked" BOOLEAN NOT NULL DEFAULT false,
  "photos" JSONB NOT NULL DEFAULT '[]',
  "note" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "received_by" UUID NOT NULL,
  CONSTRAINT "material_proposal_item_receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "material_proposal_item_receipts_proposal_id_item_seq_idx"
  ON "material_proposal_item_receipts"("proposal_id", "item_seq");
CREATE INDEX "material_proposal_item_receipts_received_at_idx"
  ON "material_proposal_item_receipts"("received_at");

ALTER TABLE "material_proposal_item_receipts"
  ADD CONSTRAINT "material_proposal_item_receipts_proposal_id_fkey"
  FOREIGN KEY ("proposal_id") REFERENCES "material_proposals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "material_proposal_item_receipts"
  ADD CONSTRAINT "material_proposal_item_receipts_received_by_fkey"
  FOREIGN KEY ("received_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Material proposal item debts (KT ghi công nợ từng món)
CREATE TABLE "material_proposal_item_debts" (
  "id" UUID NOT NULL,
  "proposal_id" UUID NOT NULL,
  "item_seq" INTEGER NOT NULL,
  "supplier_id" UUID NOT NULL,
  "supplier_item_code" TEXT,
  "unit_price" DECIMAL(18, 2) NOT NULL,
  "qty" DECIMAL(18, 3) NOT NULL,
  "total_amount" DECIMAL(18, 2) NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recorded_by" UUID NOT NULL,
  "paid_at" TIMESTAMP(3),
  CONSTRAINT "material_proposal_item_debts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "material_proposal_item_debts_proposal_id_item_seq_key"
  ON "material_proposal_item_debts"("proposal_id", "item_seq");
CREATE INDEX "material_proposal_item_debts_supplier_id_paid_at_idx"
  ON "material_proposal_item_debts"("supplier_id", "paid_at");

ALTER TABLE "material_proposal_item_debts"
  ADD CONSTRAINT "material_proposal_item_debts_proposal_id_fkey"
  FOREIGN KEY ("proposal_id") REFERENCES "material_proposals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "material_proposal_item_debts"
  ADD CONSTRAINT "material_proposal_item_debts_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "material_proposal_item_debts"
  ADD CONSTRAINT "material_proposal_item_debts_recorded_by_fkey"
  FOREIGN KEY ("recorded_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
