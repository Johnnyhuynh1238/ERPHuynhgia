-- Phân bổ NHIỀU hạng mục ngân sách theo số tiền cho 1 hợp đồng thầu phụ.
-- budget_alloc = [{lineId, amount}], Σ amount = contract_value. Cột budget_line_id cũ giữ = hạng mục chính.
ALTER TABLE "sub_contracts" ADD COLUMN "budget_alloc" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: HĐ đang gắn 1 hạng mục → 1 phần tử phủ toàn bộ giá trị hợp đồng.
UPDATE "sub_contracts"
SET "budget_alloc" = jsonb_build_array(
  jsonb_build_object('lineId', "budget_line_id"::text, 'amount', round("contract_value")::bigint)
)
WHERE "budget_line_id" IS NOT NULL;
