-- AlterTable
ALTER TABLE "task_photos" ADD COLUMN "file_hash" VARCHAR(64);

-- CreateIndex
CREATE INDEX "task_photos_file_hash_idx" ON "task_photos"("file_hash");
