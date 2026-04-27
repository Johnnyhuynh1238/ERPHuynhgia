-- Phase 1 QC foundation
DO $$
BEGIN
  CREATE TYPE "QcItemStatus" AS ENUM ('unchecked', 'passed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "QcLogAction" AS ENUM ('status_changed', 'photo_added', 'note_updated', 'item_added');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "QcReviewAction" AS ENUM ('approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "qc_items" (
  "id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "template_item_id" UUID,
  "content" TEXT NOT NULL,
  "require_photo" BOOLEAN NOT NULL DEFAULT false,
  "require_note" BOOLEAN NOT NULL DEFAULT false,
  "created_by" UUID NOT NULL,
  "order_index" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "qc_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "qc_progress" (
  "id" UUID NOT NULL,
  "qc_item_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "status" "QcItemStatus" NOT NULL DEFAULT 'unchecked',
  "note" TEXT,
  "no_photo_reason" BOOLEAN NOT NULL DEFAULT false,
  "updated_by" UUID NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "qc_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "qc_photos" (
  "id" UUID NOT NULL,
  "qc_item_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "uploaded_by" UUID NOT NULL,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "qc_photos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "qc_logs" (
  "id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "qc_item_id" UUID,
  "action" "QcLogAction" NOT NULL,
  "from_status" "QcItemStatus",
  "to_status" "QcItemStatus",
  "note" TEXT,
  "performed_by" UUID NOT NULL,
  "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "qc_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "qc_reviews" (
  "id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "action" "QcReviewAction" NOT NULL,
  "reviewer_id" UUID NOT NULL,
  "note" TEXT,
  "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "qc_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "qc_progress_qc_item_id_key" ON "qc_progress"("qc_item_id");
CREATE INDEX IF NOT EXISTS "qc_items_task_id_order_index_idx" ON "qc_items"("task_id", "order_index");
CREATE INDEX IF NOT EXISTS "qc_progress_task_id_status_idx" ON "qc_progress"("task_id", "status");
CREATE INDEX IF NOT EXISTS "qc_photos_task_id_uploaded_at_idx" ON "qc_photos"("task_id", "uploaded_at");
CREATE INDEX IF NOT EXISTS "qc_photos_qc_item_id_idx" ON "qc_photos"("qc_item_id");
CREATE INDEX IF NOT EXISTS "qc_logs_task_id_performed_at_idx" ON "qc_logs"("task_id", "performed_at");
CREATE INDEX IF NOT EXISTS "qc_logs_qc_item_id_idx" ON "qc_logs"("qc_item_id");
CREATE INDEX IF NOT EXISTS "qc_reviews_task_id_reviewed_at_idx" ON "qc_reviews"("task_id", "reviewed_at");

DO $$
BEGIN
  ALTER TABLE "qc_items"
    ADD CONSTRAINT "qc_items_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_items"
    ADD CONSTRAINT "qc_items_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_progress"
    ADD CONSTRAINT "qc_progress_qc_item_id_fkey"
    FOREIGN KEY ("qc_item_id") REFERENCES "qc_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_progress"
    ADD CONSTRAINT "qc_progress_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_progress"
    ADD CONSTRAINT "qc_progress_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_photos"
    ADD CONSTRAINT "qc_photos_qc_item_id_fkey"
    FOREIGN KEY ("qc_item_id") REFERENCES "qc_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_photos"
    ADD CONSTRAINT "qc_photos_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_photos"
    ADD CONSTRAINT "qc_photos_uploaded_by_fkey"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_logs"
    ADD CONSTRAINT "qc_logs_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_logs"
    ADD CONSTRAINT "qc_logs_qc_item_id_fkey"
    FOREIGN KEY ("qc_item_id") REFERENCES "qc_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_logs"
    ADD CONSTRAINT "qc_logs_performed_by_fkey"
    FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_reviews"
    ADD CONSTRAINT "qc_reviews_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "qc_reviews"
    ADD CONSTRAINT "qc_reviews_reviewer_id_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Migrate old checklist text + progress JSON into new tables
WITH base_items AS (
  SELECT
    t.id AS task_id,
    t.template_id,
    COALESCE(t.assigned_engineer_id, p.main_engineer_id, p.project_manager_id) AS created_by,
    (x.ordinality - 1)::int AS order_index,
    regexp_replace(trim(x.item), '^•\\s*', '') AS content
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  CROSS JOIN LATERAL unnest(string_to_array(COALESCE(t.qc_checklist, ''), E'\n')) WITH ORDINALITY AS x(item, ordinality)
  WHERE trim(x.item) <> ''
), inserted_items AS (
  INSERT INTO qc_items (id, task_id, template_item_id, content, require_photo, require_note, created_by, order_index, created_at)
  SELECT
    gen_random_uuid(),
    b.task_id,
    NULL,
    b.content,
    false,
    false,
    b.created_by,
    b.order_index,
    now()
  FROM base_items b
  ON CONFLICT DO NOTHING
  RETURNING id, task_id, order_index
)
INSERT INTO qc_progress (id, qc_item_id, task_id, status, note, no_photo_reason, updated_by, updated_at)
SELECT
  gen_random_uuid(),
  qi.id,
  qi.task_id,
  CASE
    WHEN jsonb_typeof(t.qc_progress::jsonb -> 'checkedIndexes') = 'array'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(t.qc_progress::jsonb -> 'checkedIndexes') v
        WHERE (v)::int = qi.order_index
      )
    THEN 'passed'::"QcItemStatus"
    ELSE 'unchecked'::"QcItemStatus"
  END,
  NULL,
  false,
  COALESCE(t.assigned_engineer_id, p.main_engineer_id, p.project_manager_id),
  now()
FROM qc_items qi
JOIN tasks t ON t.id = qi.task_id
JOIN projects p ON p.id = t.project_id
LEFT JOIN qc_progress qp ON qp.qc_item_id = qi.id
WHERE qp.id IS NULL;
