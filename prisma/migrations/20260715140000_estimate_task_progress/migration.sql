-- Tiến độ thi công theo công tác dự toán (flow mới): admin kéo % + mark done từng công tác.

-- CreateTable
CREATE TABLE "estimate_task_progress" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "ref_type" VARCHAR(16) NOT NULL,
    "ref_id" TEXT NOT NULL,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_task_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estimate_task_progress_project_id_ref_type_ref_id_key" ON "estimate_task_progress"("project_id", "ref_type", "ref_id");
CREATE INDEX "estimate_task_progress_project_id_idx" ON "estimate_task_progress"("project_id");

-- AddForeignKey
ALTER TABLE "estimate_task_progress"
  ADD CONSTRAINT "estimate_task_progress_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "estimate_task_progress"
  ADD CONSTRAINT "estimate_task_progress_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
