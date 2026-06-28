-- M2 v3: Khối lượng (KL) + Định mức (ĐM) cho dự toán theo trình tự KL × ĐM × ĐG

CREATE TABLE "project_budget_quantities" (
    "id"                UUID            NOT NULL DEFAULT gen_random_uuid(),
    "project_id"        UUID            NOT NULL,
    "component_id"      UUID,
    "standard_task_id"  UUID            NOT NULL,
    "unit"              VARCHAR(20)     NOT NULL,
    "quantity"          DECIMAL(14, 3)  NOT NULL,
    "note"              TEXT,
    "created_at"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "project_budget_quantities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_budget_quantities_project_id_idx"
    ON "project_budget_quantities"("project_id");

CREATE UNIQUE INDEX "project_budget_quantities_project_id_component_id_standard__key"
    ON "project_budget_quantities"("project_id", "component_id", "standard_task_id");

ALTER TABLE "project_budget_quantities"
    ADD CONSTRAINT "project_budget_quantities_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_budget_quantities"
    ADD CONSTRAINT "project_budget_quantities_component_id_fkey"
    FOREIGN KEY ("component_id") REFERENCES "project_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_budget_quantities"
    ADD CONSTRAINT "project_budget_quantities_standard_task_id_fkey"
    FOREIGN KEY ("standard_task_id") REFERENCES "standard_task_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "project_budget_norms" (
    "id"                UUID            NOT NULL DEFAULT gen_random_uuid(),
    "project_id"        UUID            NOT NULL,
    "standard_task_id"  UUID            NOT NULL,
    "unit"              VARCHAR(20)     NOT NULL,
    "material_items"    JSONB           NOT NULL DEFAULT '[]'::jsonb,
    "labor_hours"       DECIMAL(10, 4)  NOT NULL DEFAULT 0,
    "labor_grade"       VARCHAR(20),
    "machine_items"     JSONB           NOT NULL DEFAULT '[]'::jsonb,
    "note"              TEXT,
    "created_at"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "project_budget_norms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_budget_norms_project_id_idx"
    ON "project_budget_norms"("project_id");

CREATE UNIQUE INDEX "project_budget_norms_project_id_standard_task_id_key"
    ON "project_budget_norms"("project_id", "standard_task_id");

ALTER TABLE "project_budget_norms"
    ADD CONSTRAINT "project_budget_norms_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_budget_norms"
    ADD CONSTRAINT "project_budget_norms_standard_task_id_fkey"
    FOREIGN KEY ("standard_task_id") REFERENCES "standard_task_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
