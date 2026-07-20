-- Link lệnh chi (expenses) về nguồn phát sinh để khi chi xong tự cập nhật ngược.
--   source_type = 'mua_hang_order' → source_id = mh_orders.id  (chi xong → đơn = paid)
--   source_type = 'ncc_congno'     → source_id = suppliers.id  (chi xong → insert ncc_thanh_toan)
ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "source_type" TEXT,
  ADD COLUMN IF NOT EXISTS "source_id" UUID;
