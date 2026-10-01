-- Trả hàng đã mua: đơn mh_orders giá trị ÂM (items.qty âm) liên kết đơn mua gốc.
-- Công nợ NCC (view ncc_cong_no_du_an = Σ total đơn received) tự trừ lại nhờ total âm.
-- Nguồn lệnh thu mới 'supplier_refund' cho trường hợp NCC hoàn tiền (tiền vào quỹ).

-- PG12+: ADD VALUE chạy được trong transaction của migrate (chỉ cấm dùng value đó ngay trong cùng tx).
ALTER TYPE "ReceiptSource" ADD VALUE IF NOT EXISTS 'supplier_refund';

ALTER TABLE "mh_orders" ADD COLUMN "return_of_order_id" UUID;
CREATE INDEX "mh_orders_return_of_order_id_idx" ON "mh_orders" ("return_of_order_id");
