-- GĐ 4 Thiết kế: chốt từng bước {"mat_bang": ISO lúc chốt, "kien_truc": ..., ...}.
ALTER TABLE "project_pipelines" ADD COLUMN "design_done" JSONB NOT NULL DEFAULT '{}';
