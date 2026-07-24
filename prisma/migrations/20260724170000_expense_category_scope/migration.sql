-- Danh mục chi phí theo ngữ cảnh: HĐTK/HĐTC (project) vs Chi chung công ty (company).
-- scope CHỈ lọc dropdown chọn tay ở Lệnh chi; luồng tự gắn (VATTU/Thầu phụ/MUA-LE)
-- tìm theo code/tên trực tiếp nên không bị ảnh hưởng.

ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "scope" TEXT;

-- Dùng lại danh mục cũ cho scheme mới (giữ liên kết dữ liệu cũ).
UPDATE "expense_categories" SET scope = 'project', name = 'Nhân công' WHERE code = 'NHANCONG';
UPDATE "expense_categories" SET scope = 'project', name = 'Vật tư'    WHERE code = 'VATTU';
UPDATE "expense_categories" SET scope = 'company', name = 'Văn phòng' WHERE code = 'VANPHONG';
UPDATE "expense_categories" SET scope = 'company', name = 'Lương'     WHERE code = 'LUONGQL';
UPDATE "expense_categories" SET scope = 'company', name = 'Khác'      WHERE code = 'KHAC';

-- Danh mục mới.
INSERT INTO "expense_categories" (id, code, name, sort_order, scope, active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'CHUNG-DA',  'Chung',     15, 'project', true, now(), now()),
  (gen_random_uuid(), 'MARKETING', 'Marketing', 45, 'company', true, now(), now()),
  (gen_random_uuid(), 'VANHANH',   'Vận hành',  46, 'company', true, now(), now())
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, scope = EXCLUDED.scope, active = true;
