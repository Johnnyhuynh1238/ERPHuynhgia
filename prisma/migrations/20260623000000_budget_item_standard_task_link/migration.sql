-- Link project_budget_items với standard_task_catalog
ALTER TABLE "project_budget_items"
  ADD COLUMN "standard_task_id" UUID NULL;

ALTER TABLE "project_budget_items"
  ADD CONSTRAINT "project_budget_items_std_task_fk"
  FOREIGN KEY ("standard_task_id") REFERENCES "standard_task_catalog"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "project_budget_items_std_task_idx"
  ON "project_budget_items" ("standard_task_id");
