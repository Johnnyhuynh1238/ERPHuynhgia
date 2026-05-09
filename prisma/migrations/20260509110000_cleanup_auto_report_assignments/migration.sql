-- Remove legacy daily checklist rows auto-generated from QC guide text.
-- Admin-configured checklist rows keep template_item_id; progress_update rows remain intact.
DELETE FROM "task_daily_assignments"
WHERE "type" = 'template_item'
  AND "template_item_id" IS NULL;
