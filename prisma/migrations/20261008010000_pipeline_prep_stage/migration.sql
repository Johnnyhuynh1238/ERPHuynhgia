-- Thêm GĐ 5 "Chuẩn bị" giữa Thiết kế và Thi công: 6 → 7 giai đoạn.
-- Dự án đang ở Thi công (5) / Bàn giao (6) dời lên 6 / 7; ngày chốt giữ nguyên, dời key theo.
UPDATE "project_pipelines"
SET "stage_dates" = (
      SELECT coalesce(jsonb_object_agg(
        CASE WHEN key::int >= 5 THEN (key::int + 1)::text ELSE key END, value), '{}'::jsonb)
      FROM jsonb_each("stage_dates")
    ),
    "stage" = CASE WHEN "stage" >= 5 THEN "stage" + 1 ELSE "stage" END
WHERE "stage" >= 5
   OR EXISTS (SELECT 1 FROM jsonb_object_keys("stage_dates") k WHERE k ~ '^[0-9]+$' AND k::int >= 5);

-- Checklist GĐ 5: {"du_toan": ISO lúc chốt, ...}.
ALTER TABLE "project_pipelines" ADD COLUMN "prep_done" JSONB NOT NULL DEFAULT '{}';
