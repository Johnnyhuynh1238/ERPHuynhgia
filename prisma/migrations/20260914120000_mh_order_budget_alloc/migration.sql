-- Phân bổ NHIỀU hạng mục ngân sách theo số tiền cho 1 đơn mua hàng.
-- budget_alloc = [{lineId, amount}], Σ amount = total. Cột budget_line_id cũ giữ = hạng mục chính.
ALTER TABLE "mh_orders" ADD COLUMN "budget_alloc" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: đơn đang gắn 1 hạng mục → 1 phần tử phủ toàn bộ total.
UPDATE "mh_orders"
SET "budget_alloc" = jsonb_build_array(
  jsonb_build_object('lineId', "budget_line_id"::text, 'amount', round("total")::bigint)
)
WHERE "budget_line_id" IS NOT NULL;
