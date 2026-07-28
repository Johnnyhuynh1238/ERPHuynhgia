-- Thêm 2 hạng mục chi CHUNG CÔNG TY (scope='company') vào dropdown Lệnh chi / Sổ quỹ:
--  - Tạm ứng: 'TAMUNG' vốn scope=NULL (mồ côi, không auto-gắn, không chọn tay được) → flip 'company'.
--  - Chi phí lãi vay: 'LAIVAY' thêm mới.
-- Idempotent: chạy lại (deploy) không nhân đôi.

UPDATE "expense_categories" SET scope = 'company', sort_order = 47, active = true WHERE code = 'TAMUNG';

INSERT INTO "expense_categories" (id, code, name, sort_order, scope, active, created_at, updated_at)
VALUES (gen_random_uuid(), 'LAIVAY', 'Chi phí lãi vay', 48, 'company', true, now(), now())
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, scope = EXCLUDED.scope, sort_order = EXCLUDED.sort_order, active = true;
