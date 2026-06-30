-- AlterEnum
ALTER TYPE "ReceiptStatus" ADD VALUE 'awaiting_approval' BEFORE 'pending';

-- AlterEnum: StaffNotificationKind
ALTER TYPE "StaffNotificationKind" ADD VALUE 'expense_kt_request';
ALTER TYPE "StaffNotificationKind" ADD VALUE 'expense_kt_approved';
ALTER TYPE "StaffNotificationKind" ADD VALUE 'expense_kt_rejected';
ALTER TYPE "StaffNotificationKind" ADD VALUE 'receipt_kt_request';
ALTER TYPE "StaffNotificationKind" ADD VALUE 'receipt_kt_approved';
ALTER TYPE "StaffNotificationKind" ADD VALUE 'receipt_kt_rejected';

-- AlterTable
ALTER TABLE "receipts"
  ADD COLUMN "approved_by" UUID,
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "rejected_reason" TEXT;

-- AddForeignKey
ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
