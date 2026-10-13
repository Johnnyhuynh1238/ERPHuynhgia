-- BB mẫu để in (staff-only) gắn theo mốc nghiệm thu
ALTER TABLE "acceptance_milestones" ADD COLUMN "template_files" JSONB NOT NULL DEFAULT '[]';
