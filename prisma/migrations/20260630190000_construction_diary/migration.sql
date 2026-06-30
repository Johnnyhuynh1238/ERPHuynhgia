-- CreateTable
CREATE TABLE "construction_diaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "ks_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "worker_count" INTEGER NOT NULL DEFAULT 0,
    "tasks_done" TEXT NOT NULL DEFAULT '',
    "issues" TEXT,
    "task_photos" JSONB NOT NULL DEFAULT '[]',
    "site_photos" JSONB NOT NULL DEFAULT '[]',
    "saved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_diaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "construction_diaries_project_id_ks_id_entry_date_key"
    ON "construction_diaries"("project_id", "ks_id", "entry_date");

-- CreateIndex
CREATE INDEX "construction_diaries_project_id_entry_date_idx"
    ON "construction_diaries"("project_id", "entry_date" DESC);

-- AddForeignKey
ALTER TABLE "construction_diaries"
    ADD CONSTRAINT "construction_diaries_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_diaries"
    ADD CONSTRAINT "construction_diaries_ks_id_fkey"
    FOREIGN KEY ("ks_id") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE;
