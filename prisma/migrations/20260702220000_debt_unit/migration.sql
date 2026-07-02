-- KT ghi CN có thể theo đơn vị khác đơn vị đề xuất (VD: đai đề xuất Cái, NCC bán kg).
-- Null = fallback unit từ parsed_items của proposal.
ALTER TABLE "material_proposal_item_debts"
  ADD COLUMN "debt_unit" VARCHAR(50);
