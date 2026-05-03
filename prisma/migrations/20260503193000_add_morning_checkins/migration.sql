-- CreateTable
CREATE TABLE "morning_checkins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "morning_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "morning_checkin_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "checkin_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "group" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "morning_checkin_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "morning_checkins_user_id_project_id_report_date_key" ON "morning_checkins"("user_id", "project_id", "report_date");

-- CreateIndex
CREATE INDEX "morning_checkins_project_id_report_date_idx" ON "morning_checkins"("project_id", "report_date");

-- CreateIndex
CREATE INDEX "morning_checkins_user_id_report_date_idx" ON "morning_checkins"("user_id", "report_date");

-- CreateIndex
CREATE UNIQUE INDEX "morning_checkin_tasks_checkin_id_task_id_key" ON "morning_checkin_tasks"("checkin_id", "task_id");

-- CreateIndex
CREATE INDEX "morning_checkin_tasks_task_id_idx" ON "morning_checkin_tasks"("task_id");

-- AddForeignKey
ALTER TABLE "morning_checkins" ADD CONSTRAINT "morning_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "morning_checkins" ADD CONSTRAINT "morning_checkins_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "morning_checkin_tasks" ADD CONSTRAINT "morning_checkin_tasks_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "morning_checkins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "morning_checkin_tasks" ADD CONSTRAINT "morning_checkin_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
