-- 2026-07-15 — Công nợ NCC theo DỰ ÁN chuyển sang nguồn MỚI: mh_orders
-- Flow cũ (material_proposal_item_debts) BỎ, không dùng nữa.
-- Nợ  = SUM(mh_orders.total) status='received' + có supplier_id  (theo dự án, NCC)
-- Trả = SUM(ncc_thanh_toan.so_tien)                              (cộng dồn, theo dự án, NCC)
-- Còn lại = GREATEST(nợ − trả, 0)
-- Chạy tay trên prod (bảng/view raw, không thuộc prisma migrate).

BEGIN;

CREATE OR REPLACE VIEW ncc_cong_no_du_an AS
WITH no AS (
  SELECT project_id, supplier_id, SUM(total) AS tong_no
  FROM mh_orders
  WHERE status = 'received' AND supplier_id IS NOT NULL
  GROUP BY project_id, supplier_id
),
tra AS (
  SELECT project_id, supplier_id, SUM(so_tien) AS da_tra
  FROM ncc_thanh_toan
  WHERE project_id IS NOT NULL
  GROUP BY project_id, supplier_id
)
SELECT
  COALESCE(no.project_id, tra.project_id)   AS project_id,
  COALESCE(no.supplier_id, tra.supplier_id) AS supplier_id,
  s.name                                    AS supplier_name,
  COALESCE(no.tong_no, 0)                   AS tong_no,
  COALESCE(tra.da_tra, 0)                   AS da_tra,
  GREATEST(COALESCE(no.tong_no,0) - COALESCE(tra.da_tra,0), 0) AS con_lai
FROM no
FULL OUTER JOIN tra
  ON no.project_id = tra.project_id AND no.supplier_id = tra.supplier_id
LEFT JOIN suppliers s ON s.id = COALESCE(no.supplier_id, tra.supplier_id);

COMMIT;
