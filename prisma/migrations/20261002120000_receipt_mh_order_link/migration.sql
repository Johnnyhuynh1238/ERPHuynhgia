-- Gắn lệnh thu NCC-hoàn-tiền (trả hàng) vào đơn trả (mh_orders).
-- Scalar (không FK/relation) giữ nhẹ như mh_orders.return_of_order_id.
ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "mh_order_id" UUID;
CREATE INDEX IF NOT EXISTS "receipts_mh_order_id_idx" ON "receipts"("mh_order_id");
