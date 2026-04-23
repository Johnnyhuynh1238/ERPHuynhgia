-- Add task active/display order columns (idempotent)
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "display_order" INTEGER;

-- Backfill legacy nulls
UPDATE "tasks" SET "is_active" = true WHERE "is_active" IS NULL;
