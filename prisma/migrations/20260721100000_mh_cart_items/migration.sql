-- Giỏ hàng mua sắm lưu server (thay state trình duyệt) — AI + UI dùng chung 1 giỏ.
-- 1 dòng = 1 vật tư trong giỏ của (dự án, người dùng). key canonical = matKey(name,unit).

-- CreateTable
CREATE TABLE "mh_cart_items" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mh_cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mh_cart_items_project_id_user_id_key_key" ON "mh_cart_items"("project_id", "user_id", "key");
CREATE INDEX "mh_cart_items_project_id_user_id_idx" ON "mh_cart_items"("project_id", "user_id");

-- AddForeignKey
ALTER TABLE "mh_cart_items"
  ADD CONSTRAINT "mh_cart_items_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mh_cart_items"
  ADD CONSTRAINT "mh_cart_items_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
