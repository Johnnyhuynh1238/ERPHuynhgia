CREATE TABLE IF NOT EXISTS "task_material_items" (
  "id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "is_available" BOOLEAN NOT NULL DEFAULT false,
  "order_index" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_material_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "task_material_items_task_id_order_index_idx" ON "task_material_items"("task_id", "order_index");

DO $$
BEGIN
  ALTER TABLE "task_material_items" ADD CONSTRAINT "task_material_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
