-- AlterTable
ALTER TABLE "task_report_photos" ADD COLUMN "taken_at" TIMESTAMP(3);
ALTER TABLE "task_report_photos" ADD COLUMN "file_hash" VARCHAR(64);

-- CreateIndex
CREATE INDEX "task_report_photos_file_hash_idx" ON "task_report_photos"("file_hash");
