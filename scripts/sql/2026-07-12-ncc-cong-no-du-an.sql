-- 2026-07-12 — Công nợ NCC theo DỰ ÁN (mô hình cộng dồn)
-- Nợ NCC = SUM(material_proposal_item_debts.total_amount) theo (dự án, NCC)
-- Trả NCC = SUM(ncc_thanh_toan.so_tien) theo (dự án, NCC)   [cộng dồn]
-- Còn lại = GREATEST(nợ − trả, 0)  → trả đủ thì = 0, không cần map từng đơn.
--
-- Bảng ncc_thanh_toan + view ncc_cong_no (toàn cty) đã có từ trước.
-- Migration này: thêm project_id vào ncc_thanh_toan + view per-project.
-- Chạy tay trên prod (không thuộc prisma migrate — bảng raw).

BEGIN;

-- 1. project_id để scope trả nợ theo dự án
ALTER TABLE ncc_thanh_toan
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);

-- 2. Backfill khoản trả cũ thiếu dự án (khoản 40M NCC Mạnh Hùng Cường) -> dự án Ngân
UPDATE ncc_thanh_toan
   SET project_id = '3e7328ad-1d1c-45ae-a593-77eaeaf1d922'  -- DA-2026-002 Nhà Anh Ngân
 WHERE project_id IS NULL;

-- 3. View công nợ NCC theo dự án
CREATE OR REPLACE VIEW ncc_cong_no_du_an AS
WITH no AS (
  SELECT mp.project_id, d.supplier_id, SUM(d.total_amount) AS tong_no
  FROM material_proposal_item_debts d
  JOIN material_proposals mp ON mp.id = d.proposal_id
  GROUP BY mp.project_id, d.supplier_id
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
