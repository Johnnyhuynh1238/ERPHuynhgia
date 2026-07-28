-- Danh mục THU (scope='income') cho Lệnh thu / sổ quỹ. Tách khỏi dropdown Lệnh chi
-- (chi lọc scope IN project/company nên không lẫn). AI Thu-Chi gắn khi ghi phiếu thu;
-- hiện tên danh mục trong nhật ký sổ quỹ + export.
--   - Vay nợ:    'VAYNO'
--   - Hoàn ứng:  'HOANUNG' (thu hồi tiền tạm ứng)
-- Idempotent.

INSERT INTO "expense_categories" (id, code, name, sort_order, scope, active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'VAYNO',   'Vay nợ',   1, 'income', true, now(), now()),
  (gen_random_uuid(), 'HOANUNG', 'Hoàn ứng', 2, 'income', true, now(), now())
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, scope = EXCLUDED.scope, sort_order = EXCLUDED.sort_order, active = true;
