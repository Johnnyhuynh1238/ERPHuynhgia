-- SOP-26 mục 3.10 #6: bảng giá NCC đã duyệt (hiệu lực 30 ngày, NCC chính/dự phòng, lịch sử giá).
-- Chỉ THÊM cột/bảng. unit_price giữ nguyên = giá đang dùng; giá mới chờ duyệt nằm ở pending_*.

ALTER TABLE "supplier_material_prices"
  ADD COLUMN "supplier_rank" VARCHAR(20),
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approved_by" VARCHAR(100),
  ADD COLUMN "valid_until" DATE,
  ADD COLUMN "pending_price" DECIMAL(18,2),
  ADD COLUMN "pending_rank" VARCHAR(20),
  ADD COLUMN "pending_level" VARCHAR(20),
  ADD COLUMN "pending_at" TIMESTAMP(3),
  ADD COLUMN "pending_by" UUID;

-- Giá đang có chưa ai duyệt → chờ sếp duyệt lần đầu (SOP-26 bước 23). Giá vẫn dùng như cũ tới khi duyệt.
UPDATE "supplier_material_prices"
SET "pending_price" = "unit_price", "pending_level" = 'sep', "pending_at" = "updated_at";

CREATE TABLE "supplier_price_logs" (
  "id" UUID NOT NULL,
  "price_id" UUID,
  "supplier_id" UUID NOT NULL,
  "material_name" TEXT NOT NULL,
  "unit" VARCHAR(50) NOT NULL,
  "action" VARCHAR(20) NOT NULL,
  "old_price" DECIMAL(18,2),
  "new_price" DECIMAL(18,2),
  "pct" DECIMAL(8,2),
  "level" VARCHAR(20),
  "rank" VARCHAR(20),
  "note" TEXT,
  "actor" VARCHAR(100),
  "user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_price_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_price_logs_supplier_id_material_name_idx" ON "supplier_price_logs"("supplier_id", "material_name");
CREATE INDEX "supplier_price_logs_price_id_created_at_idx" ON "supplier_price_logs"("price_id", "created_at");

ALTER TABLE "supplier_price_logs"
  ADD CONSTRAINT "supplier_price_logs_price_id_fkey"
  FOREIGN KEY ("price_id") REFERENCES "supplier_material_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
