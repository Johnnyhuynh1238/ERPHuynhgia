-- CreateTable
CREATE TABLE "task_qc_logs" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "qc_item_id" UUID NOT NULL,
    "evening_report_id" UUID,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_by" UUID NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_qc_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_qc_logs_task_id_idx" ON "task_qc_logs"("task_id");

-- CreateIndex
CREATE INDEX "task_qc_logs_qc_item_id_idx" ON "task_qc_logs"("qc_item_id");

-- CreateIndex
CREATE INDEX "task_qc_logs_evening_report_id_idx" ON "task_qc_logs"("evening_report_id");

-- AddForeignKey
ALTER TABLE "task_qc_logs" ADD CONSTRAINT "task_qc_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_qc_logs" ADD CONSTRAINT "task_qc_logs_qc_item_id_fkey" FOREIGN KEY ("qc_item_id") REFERENCES "qc_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_qc_logs" ADD CONSTRAINT "task_qc_logs_evening_report_id_fkey" FOREIGN KEY ("evening_report_id") REFERENCES "evening_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_qc_logs" ADD CONSTRAINT "task_qc_logs_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
