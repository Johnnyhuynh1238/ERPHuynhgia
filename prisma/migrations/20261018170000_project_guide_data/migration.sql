-- HD mua hàng / HD thi công đọc projects.guide_data (AI soạn tay từ HĐ thi công), bỏ phụ thuộc HĐTK.
ALTER TABLE "projects" ADD COLUMN "guide_data" JSONB;
ALTER TABLE "projects" ADD COLUMN "guide_basis" TEXT;
ALTER TABLE "projects" ADD COLUMN "guide_updated_at" TIMESTAMP(3);

-- Giữ nguyên hướng dẫn các dự án đang dùng báo giá HĐTK (VD nhà anh Phi): chép sang cột mới.
UPDATE "projects" p
   SET "guide_data" = dc."quote_data",
       "guide_basis" = 'Phụ lục vật tư HĐ ký ' || COALESCE(to_char(dc."signed_at", 'DD/MM/YYYY'), '—'),
       "guide_updated_at" = COALESCE(dc."quote_updated_at", now())
  FROM "design_contracts" dc
 WHERE dc."project_id" = p."id" AND dc."quote_data" IS NOT NULL AND p."guide_data" IS NULL;
