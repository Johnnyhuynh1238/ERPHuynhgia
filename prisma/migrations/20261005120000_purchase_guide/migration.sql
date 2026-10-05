-- Hướng dẫn mua hàng: điều chỉnh theo phụ lục HĐ (chồng lên quote_data)
CREATE TABLE "purchase_guide_adjusts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "item_key" VARCHAR(400) NOT NULL,
    "mode" VARCHAR(20) NOT NULL,
    "group_name" TEXT,
    "ten" TEXT,
    "loai" TEXT,
    "quycach" TEXT,
    "note" TEXT,
    "source" VARCHAR(120),
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_guide_adjusts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_guide_adjusts_project_id_item_key_key" ON "purchase_guide_adjusts"("project_id", "item_key");
ALTER TABLE "purchase_guide_adjusts" ADD CONSTRAINT "purchase_guide_adjusts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
