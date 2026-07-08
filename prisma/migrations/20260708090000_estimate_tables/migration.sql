-- CreateEnum
CREATE TYPE "EstimateItemStatus" AS ENUM ('draft', 'requested', 'analyzing', 'waiting_answer', 'ai_done', 'approved');

-- CreateEnum
CREATE TYPE "EstimateLineStatus" AS ENUM ('ai_draft', 'edited', 'approved');

-- CreateTable
CREATE TABLE "estimate_groups" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_items" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "method" TEXT,
    "material_spec" TEXT,
    "dimensions" TEXT,
    "drawings" JSONB NOT NULL DEFAULT '[]',
    "status" "EstimateItemStatus" NOT NULL DEFAULT 'draft',
    "qa_thread" JSONB NOT NULL DEFAULT '[]',
    "analyzed_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_lines" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "norm_code" VARCHAR(32),
    "name" TEXT NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "formula" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "status" "EstimateLineStatus" NOT NULL DEFAULT 'ai_draft',
    "ai_question" TEXT,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_groups_project_id_sort_order_idx" ON "estimate_groups"("project_id", "sort_order");

-- CreateIndex
CREATE INDEX "estimate_items_group_id_sort_order_idx" ON "estimate_items"("group_id", "sort_order");

-- CreateIndex
CREATE INDEX "estimate_items_status_idx" ON "estimate_items"("status");

-- CreateIndex
CREATE INDEX "estimate_lines_item_id_sort_order_idx" ON "estimate_lines"("item_id", "sort_order");

-- CreateIndex
CREATE INDEX "estimate_lines_norm_code_idx" ON "estimate_lines"("norm_code");

-- AddForeignKey
ALTER TABLE "estimate_groups" ADD CONSTRAINT "estimate_groups_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "estimate_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "estimate_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_norm_code_fkey" FOREIGN KEY ("norm_code") REFERENCES "norms"("code") ON DELETE SET NULL ON UPDATE CASCADE;

