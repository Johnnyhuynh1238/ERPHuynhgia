-- AlterTable
ALTER TABLE "estimate_lines" ADD COLUMN     "material_price_id" UUID;

-- CreateTable
CREATE TABLE "estimate_material_maps" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "src_name" VARCHAR(255) NOT NULL,
    "src_unit" VARCHAR(20) NOT NULL,
    "material_price_id" UUID NOT NULL,
    "factor" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_material_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estimate_material_maps_project_id_src_name_src_unit_key" ON "estimate_material_maps"("project_id", "src_name", "src_unit");

-- CreateIndex
CREATE INDEX "estimate_lines_material_price_id_idx" ON "estimate_lines"("material_price_id");

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_material_price_id_fkey" FOREIGN KEY ("material_price_id") REFERENCES "material_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_material_maps" ADD CONSTRAINT "estimate_material_maps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_material_maps" ADD CONSTRAINT "estimate_material_maps_material_price_id_fkey" FOREIGN KEY ("material_price_id") REFERENCES "material_prices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

