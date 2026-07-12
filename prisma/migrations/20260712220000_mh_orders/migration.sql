-- Module Mua hàng: đơn đặt vật tư bám dự toán (độc lập material_proposals).

-- CreateEnum
CREATE TYPE "MhOrderStatus" AS ENUM ('draft', 'ordered', 'received', 'paid');

-- CreateTable
CREATE TABLE "mh_orders" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" "MhOrderStatus" NOT NULL DEFAULT 'ordered',
    "supplier_id" UUID,
    "supplier_name" TEXT,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_date" DATE,
    "note" TEXT,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mh_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mh_orders_project_id_seq_key" ON "mh_orders"("project_id", "seq");
CREATE INDEX "mh_orders_project_id_status_idx" ON "mh_orders"("project_id", "status");
CREATE INDEX "mh_orders_project_id_created_at_idx" ON "mh_orders"("project_id", "created_at" DESC);
