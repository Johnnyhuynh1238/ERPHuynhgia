-- Thêm cột ghi chú cho công nợ từng món vật tư.
ALTER TABLE "material_proposal_item_debts"
  ADD COLUMN "note" TEXT;
