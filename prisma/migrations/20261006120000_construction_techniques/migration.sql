-- Kỹ thuật thi công: thư viện mẫu chung (nguồn của HD thi công từng dự án)
CREATE TABLE "construction_techniques" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(30) NOT NULL,
    "name" TEXT NOT NULL,
    "phase" VARCHAR(10) NOT NULL DEFAULT 'tho',
    "match_keywords" TEXT NOT NULL DEFAULT '',
    "vt_keywords" TEXT NOT NULL DEFAULT '',
    "standards" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "tasks" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "construction_techniques_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "construction_techniques_code_key" ON "construction_techniques"("code");
CREATE INDEX "construction_techniques_sort_order_idx" ON "construction_techniques"("sort_order");
