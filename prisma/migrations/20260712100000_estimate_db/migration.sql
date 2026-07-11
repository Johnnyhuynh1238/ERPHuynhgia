-- Dự toán DB (app /du-toan): app chỉ chứa DB. AI bóc & ghi thẳng.
--   material_categories  = danh mục chủng loại VT (lookup toàn hệ, để lọc)
--   estimate_db_khoan    = hạng mục khoán (HĐ + giá trị trọn gói)
--   estimate_db_materials = vật tư theo công tác (flat, ref catalog chuẩn) → thống kê SL VT

-- 1) Danh mục chủng loại vật tư
CREATE TABLE "material_categories" (
  "id"         UUID NOT NULL,
  "name"       TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "retired_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "material_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "material_categories_name_key" ON "material_categories"("name");
CREATE INDEX "material_categories_sort_order_idx" ON "material_categories"("sort_order");

-- 2) Hạng mục khoán
CREATE TABLE "estimate_db_khoan" (
  "id"         UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "name"       TEXT NOT NULL,
  "unit"       VARCHAR(20),
  "quantity"   DECIMAL(14,3),
  "unit_price" BIGINT,
  "value"      BIGINT NOT NULL DEFAULT 0,
  "contractor" TEXT,
  "note"       TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "estimate_db_khoan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "estimate_db_khoan_project_id_sort_order_idx" ON "estimate_db_khoan"("project_id", "sort_order");
ALTER TABLE "estimate_db_khoan"
  ADD CONSTRAINT "estimate_db_khoan_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Vật tư theo công tác (flat)
CREATE TABLE "estimate_db_materials" (
  "id"          UUID NOT NULL,
  "project_id"  UUID NOT NULL,
  "catalog_id"  UUID,
  "category_id" UUID,
  "name"        TEXT NOT NULL,
  "unit"        VARCHAR(20) NOT NULL,
  "quantity"    DECIMAL(14,3) NOT NULL,
  "unit_price"  BIGINT NOT NULL DEFAULT 0,
  "note"        TEXT,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "estimate_db_materials_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "estimate_db_materials_project_id_catalog_id_idx" ON "estimate_db_materials"("project_id", "catalog_id");
CREATE INDEX "estimate_db_materials_project_id_category_id_idx" ON "estimate_db_materials"("project_id", "category_id");
ALTER TABLE "estimate_db_materials"
  ADD CONSTRAINT "estimate_db_materials_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "estimate_db_materials"
  ADD CONSTRAINT "estimate_db_materials_catalog_id_fkey"
  FOREIGN KEY ("catalog_id") REFERENCES "standard_task_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "estimate_db_materials"
  ADD CONSTRAINT "estimate_db_materials_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "material_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed danh mục chủng loại mặc định (idempotent theo name)
INSERT INTO "material_categories" ("id", "name", "sort_order") VALUES
  (gen_random_uuid(), 'Xi măng',          10),
  (gen_random_uuid(), 'Cát',              20),
  (gen_random_uuid(), 'Đá',               30),
  (gen_random_uuid(), 'Thép',             40),
  (gen_random_uuid(), 'Bê tông',          50),
  (gen_random_uuid(), 'Gạch',             60),
  (gen_random_uuid(), 'Cốp pha',          70),
  (gen_random_uuid(), 'Chống thấm',       80),
  (gen_random_uuid(), 'Ống nước',         90),
  (gen_random_uuid(), 'Phụ kiện nước',   100),
  (gen_random_uuid(), 'Dây điện',        110),
  (gen_random_uuid(), 'Thiết bị điện',   120),
  (gen_random_uuid(), 'Sơn',             130),
  (gen_random_uuid(), 'Gạch ốp lát',     140),
  (gen_random_uuid(), 'Cửa',             150),
  (gen_random_uuid(), 'Mái',             160),
  (gen_random_uuid(), 'Vữa',             170),
  (gen_random_uuid(), 'Khác',            999)
ON CONFLICT ("name") DO NOTHING;
