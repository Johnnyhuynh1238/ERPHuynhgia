-- M3: Phiếu giao việc hàng ngày (WorkOrder)
-- Enum WorkOrderStatus + 2 bảng

DO $$ BEGIN
  CREATE TYPE "WorkOrderStatus" AS ENUM ('open', 'done', 'carried');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- work_orders: 1 phiếu / nhóm / ngày / công trình
CREATE TABLE IF NOT EXISTS "work_orders" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"     UUID NOT NULL,
  "date"           DATE NOT NULL,
  "group_no"       INTEGER NOT NULL,
  "budget_item_id" UUID NOT NULL,
  "work_item"      TEXT NOT NULL,
  "unit"           VARCHAR(20) NOT NULL,
  "unit_price"     BIGINT NOT NULL,
  "target_qty"     DECIMAL(14, 3) NOT NULL,
  "tech_note"      TEXT,
  "status"         "WorkOrderStatus" NOT NULL DEFAULT 'open',
  "created_by_id"  UUID NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_orders_project_fk"     FOREIGN KEY ("project_id")     REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "work_orders_budget_item_fk" FOREIGN KEY ("budget_item_id") REFERENCES "project_budget_items"("id"),
  CONSTRAINT "work_orders_created_fk"     FOREIGN KEY ("created_by_id")  REFERENCES "users"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_orders_project_date_group_uq" ON "work_orders"("project_id", "date", "group_no");
CREATE INDEX IF NOT EXISTS "work_orders_project_date_idx" ON "work_orders"("project_id", "date");
CREATE INDEX IF NOT EXISTS "work_orders_budget_item_idx" ON "work_orders"("budget_item_id");

-- work_order_workers: thợ thuộc phiếu
CREATE TABLE IF NOT EXISTS "work_order_workers" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "work_order_id" UUID NOT NULL,
  "worker_id"     UUID NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_order_workers_wo_fk"     FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE,
  CONSTRAINT "work_order_workers_worker_fk" FOREIGN KEY ("worker_id")     REFERENCES "workers"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_order_workers_wo_worker_uq" ON "work_order_workers"("work_order_id", "worker_id");
CREATE INDEX IF NOT EXISTS "work_order_workers_worker_idx" ON "work_order_workers"("worker_id");
