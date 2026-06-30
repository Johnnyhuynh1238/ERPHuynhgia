-- Đổi index (proposal_id, item_seq) trên material_proposal_item_receipts
-- sang UNIQUE để cho phép Prisma upsert theo composite key.

DROP INDEX IF EXISTS "material_proposal_item_receipts_proposal_id_item_seq_idx";

CREATE UNIQUE INDEX "material_proposal_item_receipts_proposal_id_item_seq_key"
  ON "material_proposal_item_receipts"("proposal_id", "item_seq");
