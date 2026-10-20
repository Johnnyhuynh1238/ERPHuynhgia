-- Nhóm HĐ chủ nhà: chỉ admin xem (+ chủ nhà qua cổng khách nếu bật). Tắt kỹ sư / kế toán / thầu phụ ở mẫu + mọi dự án.
UPDATE "project_doc_groups"
SET "perm_engineer" = false, "perm_accountant" = false, "perm_subcontractor" = false, "updated_at" = NOW()
WHERE "system_key" = 'hd_chu_nha';
