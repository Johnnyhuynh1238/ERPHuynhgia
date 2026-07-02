-- AlterTable
ALTER TABLE "receipts"
  ADD COLUMN "payment_schedule_id" UUID;

-- CreateIndex
CREATE INDEX "receipts_payment_schedule_id_idx" ON "receipts"("payment_schedule_id");

-- AddForeignKey
ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_payment_schedule_id_fkey"
  FOREIGN KEY ("payment_schedule_id") REFERENCES "payment_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
