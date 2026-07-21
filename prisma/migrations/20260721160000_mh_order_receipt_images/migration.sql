-- Ảnh chứng minh nhận hàng cho đơn mua hàng (kế toán bắt buộc up khi mark "đã nhận").
-- receipt_images = [{url,kind}] với kind = 'phieu' (phiếu nhận hàng) | 'hang' (ảnh hàng thực tế).

ALTER TABLE "mh_orders" ADD COLUMN "receipt_images" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "mh_orders" ADD COLUMN "received_at" TIMESTAMP(3);
ALTER TABLE "mh_orders" ADD COLUMN "received_by" UUID;

ALTER TABLE "mh_orders"
  ADD CONSTRAINT "mh_orders_received_by_fkey"
  FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
