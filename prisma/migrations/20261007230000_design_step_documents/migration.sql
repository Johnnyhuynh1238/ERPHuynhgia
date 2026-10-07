-- GĐ 4 Thiết kế: hồ sơ dự án gắn bước thiết kế (mat_bang | kien_truc | ket_cau | dien_nuoc); NULL = hồ sơ thường.
ALTER TABLE "project_documents" ADD COLUMN "design_step" VARCHAR(20);
-- Nhóm ảnh thiết kế của bước 3D phối cảnh (design_step = 'phoi_canh'); NULL = nhóm thường.
ALTER TABLE "design_photo_groups" ADD COLUMN "design_step" VARCHAR(20);

-- Danh mục chi phí thiết kế thuê ngoài (lệnh chi từ màn Thiết kế).
INSERT INTO "expense_categories" (id, code, name, sort_order, scope, active, created_at, updated_at)
VALUES (gen_random_uuid(), 'THIETKE', 'Thiết kế', 15, 'project', true, now() at time zone 'UTC', now() at time zone 'UTC')
ON CONFLICT (code) DO NOTHING;
