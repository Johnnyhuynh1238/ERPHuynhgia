-- Dòng ngân sách nối PHẦN tiến độ bằng MÃ (section_id) thay vì khớp TÊN.
-- Lý do: tên dòng hay kèm ghi chú "(Vĩnh Tường)", "(khách cấp …)" → lệch tên phần → mất ngày
-- dự kiến → hạng mục biến khỏi timeline tiến độ.
ALTER TABLE "project_budget_plan_lines" ADD COLUMN "section_id" UUID;
CREATE INDEX "project_budget_plan_lines_section_id_idx" ON "project_budget_plan_lines"("section_id");
ALTER TABLE "project_budget_plan_lines" ADD CONSTRAINT "project_budget_plan_lines_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "project_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: khớp tên chuẩn hoá (bỏ ngoặc cuối, gộp khoảng trắng, không phân biệt hoa/thường)
-- trong cùng dự án. Tên phần trùng nhau → lấy phần sort_order nhỏ nhất.
UPDATE "project_budget_plan_lines" l
   SET "section_id" = (
     SELECT ps.id FROM "project_sections" ps
       JOIN "project_budget_plans" p ON p.project_id = ps.project_id
      WHERE p.id = l.plan_id
        AND upper(btrim(regexp_replace(regexp_replace(ps.name, '\s*\([^()]*\)\s*$', ''), '\s+', ' ', 'g')))
          = upper(btrim(regexp_replace(regexp_replace(l.name, '\s*\([^()]*\)\s*$', ''), '\s+', ' ', 'g')))
      ORDER BY ps.sort_order, ps.created_at
      LIMIT 1)
 WHERE l.section_id IS NULL;

-- Tiến độ % đang lưu theo TÊN dòng (ref_type 'budget') → chuyển sang MÃ dòng (ref_type 'line').
-- Mã dòng giờ ổn định (PUT ngân sách upsert theo id, không xoá-tạo lại).
UPDATE "estimate_task_progress" t
   SET "ref_type" = 'line', "ref_id" = l.id::text
  FROM "project_budget_plan_lines" l
  JOIN "project_budget_plans" p ON p.id = l.plan_id
 WHERE t.ref_type = 'budget' AND t.project_id = p.project_id AND t.ref_id = l.name
   AND NOT EXISTS (SELECT 1 FROM "estimate_task_progress" x
                    WHERE x.project_id = t.project_id AND x.ref_type = 'line' AND x.ref_id = l.id::text);

-- Chặn XOÁ dòng ngân sách đã gắn phần tiến độ / chi phí / tiến độ %. Bỏ hạng mục (VD phụ lục
-- trừ phần khách cấp) → đặt ngân sách = 0, KHÔNG xoá dòng. Xoá dây chuyền (xoá cả plan/dự án)
-- vẫn cho qua: lúc đó plan cha đã mất.
CREATE OR REPLACE FUNCTION budget_line_block_delete() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM project_budget_plans WHERE id = OLD.plan_id) THEN
    RETURN OLD;
  END IF;
  IF OLD.section_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM mh_orders WHERE budget_line_id = OLD.id
                   OR budget_alloc @> jsonb_build_array(jsonb_build_object('lineId', OLD.id::text)))
     OR EXISTS (SELECT 1 FROM mh_cart_items WHERE budget_line_id = OLD.id)
     OR EXISTS (SELECT 1 FROM sub_contracts WHERE budget_line_id = OLD.id
                   OR budget_alloc @> jsonb_build_array(jsonb_build_object('lineId', OLD.id::text)))
     OR EXISTS (SELECT 1 FROM expenses WHERE budget_line_id = OLD.id)
     OR EXISTS (SELECT 1 FROM cash_transactions WHERE budget_line_id = OLD.id)
     OR EXISTS (SELECT 1 FROM estimate_task_progress WHERE ref_type = 'line' AND ref_id = OLD.id::text)
  THEN
    RAISE EXCEPTION 'Không xoá dòng ngân sách "%" (đã gắn phần tiến độ/chi phí) — đặt ngân sách = 0 thay vì xoá', OLD.name;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER budget_line_block_delete
  BEFORE DELETE ON "project_budget_plan_lines"
  FOR EACH ROW EXECUTE FUNCTION budget_line_block_delete();
