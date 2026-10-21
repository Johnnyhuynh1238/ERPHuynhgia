-- Ô trao đổi công việc nội bộ dự án (chủ đề + bình luận).
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'project_topic_new';
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'project_topic_comment';

CREATE TABLE IF NOT EXISTS "project_topics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" TEXT,
  "author_id" UUID NOT NULL,
  "author_name" VARCHAR(120) NOT NULL,
  "comment_count" INTEGER NOT NULL DEFAULT 0,
  "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_topics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_topics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "project_topics_project_id_last_activity_at_idx" ON "project_topics"("project_id", "last_activity_at");

CREATE TABLE IF NOT EXISTS "project_topic_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "topic_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "author_id" UUID NOT NULL,
  "author_name" VARCHAR(120) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_topic_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_topic_comments_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "project_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "project_topic_comments_topic_id_created_at_idx" ON "project_topic_comments"("topic_id", "created_at");
