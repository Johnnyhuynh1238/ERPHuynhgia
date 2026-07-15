-- Nhật ký chặn đơn mua hàng của kế toán (thiếu giá / vượt SL dự toán).
-- Admin xem để biết vật tư nào cần duyệt giá hoặc vượt định mức.

-- CreateEnum
CREATE TYPE "MhBlockKind" AS ENUM ('missing_price', 'over_budget');

-- CreateTable
CREATE TABLE "mh_order_blocks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "MhBlockKind" NOT NULL,
    "material_name" TEXT NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "need" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "have" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "budget" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mh_order_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mh_order_blocks_project_id_created_at_idx" ON "mh_order_blocks"("project_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "mh_order_blocks"
  ADD CONSTRAINT "mh_order_blocks_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mh_order_blocks"
  ADD CONSTRAINT "mh_order_blocks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
