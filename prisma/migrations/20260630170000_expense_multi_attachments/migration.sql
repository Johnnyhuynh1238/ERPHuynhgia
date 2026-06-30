-- Lệnh chi: cho phép đính kèm nhiều ảnh hoá đơn trong cùng 1 lệnh.
ALTER TABLE "expenses"
  ADD COLUMN "attachment_urls" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: gộp attachment_url cũ vào mảng mới.
UPDATE "expenses"
SET "attachment_urls" = ARRAY["attachment_url"]
WHERE "attachment_url" IS NOT NULL AND "attachment_url" <> '';
