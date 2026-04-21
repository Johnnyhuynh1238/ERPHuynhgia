-- AlterTable
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "proposer_role" TEXT NOT NULL DEFAULT '';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "orderer_role" TEXT NOT NULL DEFAULT '';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "receiver_role" TEXT NOT NULL DEFAULT '';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "display_order" INTEGER;

-- Backfill from task_templates where available
UPDATE "tasks" t
SET
  "proposer_role" = COALESCE(NULLIF(t."proposer_role", ''), tt."proposer_role", ''),
  "orderer_role" = COALESCE(NULLIF(t."orderer_role", ''), tt."orderer_role", ''),
  "receiver_role" = COALESCE(NULLIF(t."receiver_role", ''), tt."receiver_role", ''),
  "display_order" = COALESCE(t."display_order", tt."display_order")
FROM "task_templates" tt
WHERE t."template_id" = tt."id";

-- Ensure active flag has no NULLs for legacy rows
UPDATE "tasks" SET "is_active" = true WHERE "is_active" IS NULL;
