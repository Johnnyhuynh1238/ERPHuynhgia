-- Dự toán khối lượng: bảng CÔNG TÁC (KL + đơn giá khoán NC) + VT tiêu hao gắn công tác.
CREATE TABLE "estimate_works" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "section_id" UUID,
  "name" TEXT NOT NULL,
  "location" TEXT,
  "unit" VARCHAR(20) NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "labor_price" BIGINT NOT NULL DEFAULT 0,
  "note" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "estimate_works_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "estimate_works_project_id_section_id_sort_order_idx" ON "estimate_works"("project_id", "section_id", "sort_order");
ALTER TABLE "estimate_works" ADD CONSTRAINT "estimate_works_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "estimate_works" ADD CONSTRAINT "estimate_works_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "project_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "estimate_db_materials" ADD COLUMN "work_id" UUID, ADD COLUMN "supplier_id" UUID;
CREATE INDEX "estimate_db_materials_work_id_idx" ON "estimate_db_materials"("work_id");
ALTER TABLE "estimate_db_materials" ADD CONSTRAINT "estimate_db_materials_work_id_fkey"
  FOREIGN KEY ("work_id") REFERENCES "estimate_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "estimate_db_materials" ADD CONSTRAINT "estimate_db_materials_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
