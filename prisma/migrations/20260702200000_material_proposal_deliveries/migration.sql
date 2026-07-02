-- CreateTable: material_proposal_deliveries
-- Mỗi đợt KS nhận hàng tại công trình cho 1 đơn PO. Bắt buộc ảnh phiếu giao NCC + ảnh hàng hoá.
CREATE TABLE "material_proposal_deliveries" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "proposal_id"    UUID         NOT NULL,
    "delivered_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by"    UUID         NOT NULL,
    "invoice_photos" JSONB        NOT NULL DEFAULT '[]',
    "goods_photos"   JSONB        NOT NULL DEFAULT '[]',
    "items_snapshot" JSONB        NOT NULL DEFAULT '[]',
    "note"           TEXT,

    CONSTRAINT "material_proposal_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "material_proposal_deliveries_proposal_id_delivered_at_idx"
    ON "material_proposal_deliveries" ("proposal_id", "delivered_at" DESC);

ALTER TABLE "material_proposal_deliveries"
    ADD CONSTRAINT "material_proposal_deliveries_proposal_id_fkey"
    FOREIGN KEY ("proposal_id") REFERENCES "material_proposals" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "material_proposal_deliveries"
    ADD CONSTRAINT "material_proposal_deliveries_received_by_fkey"
    FOREIGN KEY ("received_by") REFERENCES "users" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
