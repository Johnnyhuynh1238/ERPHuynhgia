-- Mẫu mô tả chung theo hạng mục (global). Copy vào EstimateItem.method khi tạo hạng mục trùng tên.
CREATE TABLE "estimate_item_defaults" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "method" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "estimate_item_defaults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "estimate_item_defaults_name_key" ON "estimate_item_defaults"("name");
