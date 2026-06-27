-- Lệnh thu (Receipt) — đối xứng với Expense
-- Admin tạo lệnh thu (customer/loan/advance_return/other) → KT đánh dấu đã thu → tạo CashTransaction direction=in

-- CreateEnum
CREATE TYPE "ReceiptSource" AS ENUM ('customer', 'loan', 'advance_return', 'other');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('pending', 'received', 'cancelled');

-- AlterEnum
ALTER TYPE "CashTxnRefType" ADD VALUE IF NOT EXISTS 'receipt';

-- AlterEnum
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'receipt_new';
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'receipt_received';
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'receipt_cancelled';

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "source" "ReceiptSource" NOT NULL,
    "project_id" UUID,
    "amount" DECIMAL(18,2) NOT NULL,
    "payer" TEXT,
    "payment_method" TEXT,
    "note" TEXT,
    "attachment_url" TEXT,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'pending',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" UUID,
    "received_at" TIMESTAMP(3),
    "received_amount" DECIMAL(18,2),
    "received_note" TEXT,
    "received_receipt_url" TEXT,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_reason" TEXT,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipts_code_key" ON "receipts"("code");

-- CreateIndex
CREATE INDEX "receipts_status_created_at_idx" ON "receipts"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "receipts_project_id_created_at_idx" ON "receipts"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "receipts_source_created_at_idx" ON "receipts"("source", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
