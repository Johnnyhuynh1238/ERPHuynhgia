-- Lệnh chi (expenses) gắn được vào HĐ thiết kế (design_contracts)
-- Schema đã khai báo Expense.designContractId nhưng thiếu migration tạo cột → bổ sung.

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "design_contract_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_design_contract_id_fkey'
  ) THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_design_contract_id_fkey"
      FOREIGN KEY ("design_contract_id") REFERENCES "design_contracts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "expenses_design_contract_id_idx" ON "expenses"("design_contract_id");
