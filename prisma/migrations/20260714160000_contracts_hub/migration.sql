-- Contracts hub: gắn khoản sổ quỹ vào HĐ thiết kế + cho phép HĐTK thiếu SĐT (đánh dấu "cần bổ sung")

-- Link cash_transactions -> design_contracts (thu/chi của HĐ thiết kế)
ALTER TABLE "cash_transactions" ADD COLUMN "design_contract_id" UUID;
ALTER TABLE "cash_transactions"
  ADD CONSTRAINT "cash_transactions_design_contract_id_fkey"
  FOREIGN KEY ("design_contract_id") REFERENCES "design_contracts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "cash_transactions_design_contract_id_idx" ON "cash_transactions"("design_contract_id");

-- Cho phép HĐ thiết kế thiếu SĐT (tạo trước, bổ sung sau)
ALTER TABLE "design_contracts" ALTER COLUMN "customer_phone" DROP NOT NULL;
