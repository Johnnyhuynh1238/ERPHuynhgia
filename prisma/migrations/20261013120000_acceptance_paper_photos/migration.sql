-- Nghiệm thu ký giấy: lưu ảnh BB đã ký + ảnh công trình theo mốc.
ALTER TABLE "acceptance_milestones" ADD COLUMN "bien_ban_photos" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "acceptance_milestones" ADD COLUMN "site_photos" JSONB NOT NULL DEFAULT '[]';
