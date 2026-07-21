-- Lệnh chi: link tới đợt thanh toán thầu phụ (auto mark đợt đã chi khi expense paid)
ALTER TABLE "expenses" ADD COLUMN "sub_payment_id" UUID;

CREATE INDEX "expenses_sub_payment_id_idx" ON "expenses"("sub_payment_id");

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_sub_payment_id_fkey"
  FOREIGN KEY ("sub_payment_id") REFERENCES "sub_payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
