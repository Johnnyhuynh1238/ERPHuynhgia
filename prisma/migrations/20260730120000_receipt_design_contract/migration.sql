-- Lệnh thu (receipts) gắn được vào HĐ thiết kế (design_contracts) — đợt thu HĐTK

ALTER TABLE "receipts" ADD COLUMN "design_contract_id" UUID;
ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_design_contract_id_fkey"
  FOREIGN KEY ("design_contract_id") REFERENCES "design_contracts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "receipts_design_contract_id_idx" ON "receipts"("design_contract_id");
