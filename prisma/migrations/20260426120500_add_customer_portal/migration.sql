-- AlterTable
ALTER TABLE "projects"
  ADD COLUMN "customer_id_number" TEXT,
  ADD COLUMN "customer_portal_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "customer_portal_password" TEXT,
  ADD COLUMN "customer_portal_token" UUID;

-- Backfill token for existing rows
UPDATE "projects"
SET "customer_portal_token" = gen_random_uuid()
WHERE "customer_portal_token" IS NULL;

-- AlterTable
ALTER TABLE "projects"
  ALTER COLUMN "customer_portal_token" SET NOT NULL;

-- AlterTable
ALTER TABLE "tasks"
  ADD COLUMN "visible_to_customer" BOOLEAN NOT NULL DEFAULT false;

-- default milestone visible true for old data
UPDATE "tasks"
SET "visible_to_customer" = true
WHERE "is_milestone" = true;

-- CreateTable
CREATE TABLE "customer_sessions" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "token_id" UUID NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "logged_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_comments" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "task_id" UUID,
  "evening_report_id" UUID,
  "content" TEXT NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_by_staff" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "customer_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_comment_replies" (
  "id" UUID NOT NULL,
  "comment_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_comment_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_acknowledgments" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "signature_url" TEXT NOT NULL,
  "ip_address" TEXT NOT NULL,
  "user_agent" TEXT NOT NULL,
  "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "customer_acknowledgments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_login_attempts" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "ip_address" TEXT NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "blocked_until" TIMESTAMP(3),
  "last_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_login_attempts_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "projects_customer_portal_token_key" ON "projects"("customer_portal_token");
CREATE INDEX "tasks_project_id_visible_to_customer_idx" ON "tasks"("project_id", "visible_to_customer");
CREATE UNIQUE INDEX "customer_sessions_token_id_key" ON "customer_sessions"("token_id");
CREATE INDEX "customer_sessions_project_id_idx" ON "customer_sessions"("project_id");
CREATE INDEX "customer_sessions_expires_at_idx" ON "customer_sessions"("expires_at");
CREATE INDEX "customer_comments_project_id_idx" ON "customer_comments"("project_id");
CREATE INDEX "customer_comments_task_id_idx" ON "customer_comments"("task_id");
CREATE INDEX "customer_comments_evening_report_id_idx" ON "customer_comments"("evening_report_id");
CREATE INDEX "customer_comments_read_by_staff_idx" ON "customer_comments"("read_by_staff");
CREATE INDEX "customer_comment_replies_comment_id_created_at_idx" ON "customer_comment_replies"("comment_id", "created_at");
CREATE UNIQUE INDEX "customer_acknowledgments_task_id_key" ON "customer_acknowledgments"("task_id");
CREATE INDEX "customer_acknowledgments_project_id_idx" ON "customer_acknowledgments"("project_id");
CREATE UNIQUE INDEX "customer_login_attempts_token_ip_address_key" ON "customer_login_attempts"("token", "ip_address");
CREATE INDEX "customer_login_attempts_project_id_idx" ON "customer_login_attempts"("project_id");
CREATE INDEX "customer_login_attempts_blocked_until_idx" ON "customer_login_attempts"("blocked_until");

-- Foreign keys
ALTER TABLE "customer_sessions"
  ADD CONSTRAINT "customer_sessions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_comments"
  ADD CONSTRAINT "customer_comments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_comments"
  ADD CONSTRAINT "customer_comments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_comments"
  ADD CONSTRAINT "customer_comments_evening_report_id_fkey"
  FOREIGN KEY ("evening_report_id") REFERENCES "evening_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_comment_replies"
  ADD CONSTRAINT "customer_comment_replies_comment_id_fkey"
  FOREIGN KEY ("comment_id") REFERENCES "customer_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_comment_replies"
  ADD CONSTRAINT "customer_comment_replies_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_acknowledgments"
  ADD CONSTRAINT "customer_acknowledgments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_acknowledgments"
  ADD CONSTRAINT "customer_acknowledgments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_login_attempts"
  ADD CONSTRAINT "customer_login_attempts_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
