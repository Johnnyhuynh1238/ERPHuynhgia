-- CreateTable
CREATE TABLE "project_activity_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "actor_id" UUID,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "diff" JSONB,
    "snapshot" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_activity_logs_project_id_created_at_idx" ON "project_activity_logs"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "project_activity_logs_project_id_entity_created_at_idx" ON "project_activity_logs"("project_id", "entity", "created_at" DESC);

-- CreateIndex
CREATE INDEX "project_activity_logs_actor_id_created_at_idx" ON "project_activity_logs"("actor_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "project_activity_logs" ADD CONSTRAINT "project_activity_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activity_logs" ADD CONSTRAINT "project_activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
