-- Hạng mục ngân sách gắn cho CẢ ĐƠN mua hàng (thay per-dòng item.hm cũ).
ALTER TABLE "mh_orders" ADD COLUMN "budget_line_id" UUID;
CREATE INDEX "mh_orders_budget_line_id_idx" ON "mh_orders" ("budget_line_id");

-- Backfill: mỗi đơn lấy hạng mục (item.hm) có tổng thành tiền lớn nhất trong items.
UPDATE "mh_orders" o
SET "budget_line_id" = ranked.hm::uuid
FROM (
  SELECT id, hm FROM (
    SELECT
      o2.id AS id,
      (elem->>'hm') AS hm,
      ROW_NUMBER() OVER (
        PARTITION BY o2.id
        ORDER BY SUM(
          COALESCE((elem->>'qty')::numeric, 0) * COALESCE((elem->>'price')::numeric, 0)
        ) DESC
      ) AS rn
    FROM "mh_orders" o2,
         LATERAL jsonb_array_elements(o2.items) elem
    WHERE elem->>'hm' IS NOT NULL AND elem->>'hm' <> ''
    GROUP BY o2.id, (elem->>'hm')
  ) w
  WHERE rn = 1
) ranked
WHERE o.id = ranked.id;
