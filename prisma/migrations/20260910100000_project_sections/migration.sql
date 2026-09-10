-- PHẦN dự án (nhóm hạng mục theo HĐTK, per-dự án). Thay dần grouping theo catalog công tác.

-- CreateTable
CREATE TABLE "project_sections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "BudgetPlanGroup" NOT NULL DEFAULT 'tho',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_sections_project_id_sort_order_idx" ON "project_sections"("project_id", "sort_order");

-- AddForeignKey
ALTER TABLE "project_sections" ADD CONSTRAINT "project_sections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: gắn PHẦN vào vật tư dự toán
ALTER TABLE "estimate_db_materials" ADD COLUMN "section_id" UUID;

-- CreateIndex
CREATE INDEX "estimate_db_materials_project_id_section_id_idx" ON "estimate_db_materials"("project_id", "section_id");

-- AddForeignKey
ALTER TABLE "estimate_db_materials" ADD CONSTRAINT "estimate_db_materials_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "project_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
