-- Remap danh mục lệnh chi cũ về scheme mới (project: Nhân công/Vật tư/Chung; company: Khác).
-- Chỉ đổi expenses.category_id (dữ liệu lịch sử) để thống kê gọn. KHÔNG đụng luồng tự động.

-- Tiện: lấy id theo code.
DO $$
DECLARE
  id_nhancong UUID := (SELECT id FROM expense_categories WHERE code = 'NHANCONG');
  id_vattu    UUID := (SELECT id FROM expense_categories WHERE code = 'VATTU');
  id_chung    UUID := (SELECT id FROM expense_categories WHERE code = 'CHUNG-DA');
  id_khac     UUID := (SELECT id FROM expense_categories WHERE code = 'KHAC');
BEGIN
  -- 1) KHÔNG gắn dự án → chi chung công ty → Khác (gom hết).
  UPDATE expenses SET category_id = id_khac WHERE project_id IS NULL;

  -- 2) CÓ gắn dự án → gom về Nhân công / Vật tư / Chung.
  -- 2a. Vật tư: mua VT trả ngay + mua lẻ công trình → Vật tư. (VATTU sẵn = Vật tư, giữ.)
  UPDATE expenses e SET category_id = id_vattu
   FROM expense_categories c
   WHERE e.category_id = c.id AND e.project_id IS NOT NULL
     AND c.code IN ('MUA_VT_TRA_NGAY', 'MUA-LE');

  -- 2b. Nhân công: lương QL trên dự án → Nhân công. (NHANCONG sẵn = Nhân công, giữ.)
  UPDATE expenses e SET category_id = id_nhancong
   FROM expense_categories c
   WHERE e.category_id = c.id AND e.project_id IS NOT NULL
     AND c.code IN ('LUONGQL');

  -- 2c. Chung: Khác/Xăng dầu/Tiếp khách trên dự án → Chung.
  UPDATE expenses e SET category_id = id_chung
   FROM expense_categories c
   WHERE e.category_id = c.id AND e.project_id IS NOT NULL
     AND c.code IN ('KHAC', 'XANGDAU', 'TIEPKHACH');

  -- 2d. Thầu phụ trên dự án: mặc định = Nhân công (thầu phụ đa số là nhân công).
  --     Ngoại lệ "thầu phụ khác" (cung cấp/lắp vật tư) → Chung. Hiện chỉ rõ 1 NCC.
  UPDATE expenses e SET category_id = id_nhancong
   FROM expense_categories c
   WHERE e.category_id = c.id AND e.project_id IS NOT NULL AND c.code = 'THAUPHU';

  UPDATE expenses SET category_id = id_chung
   WHERE project_id IS NOT NULL AND payee ILIKE '%Việt Đức%';
END $$;
