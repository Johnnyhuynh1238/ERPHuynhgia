-- Dự toán rút gọn: phân loại dòng kl/vt/khoan, VT con trỏ công tác, nhóm khoán
ALTER TABLE "estimate_lines"
  ADD COLUMN "section" VARCHAR(8) NOT NULL DEFAULT 'kl',
  ADD COLUMN "parent_line_id" UUID,
  ADD COLUMN "khoan_group" VARCHAR(8);

ALTER TABLE "estimate_lines"
  ADD CONSTRAINT "estimate_lines_parent_line_id_fkey"
  FOREIGN KEY ("parent_line_id") REFERENCES "estimate_lines"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "estimate_lines_parent_line_id_idx" ON "estimate_lines"("parent_line_id");
CREATE INDEX "estimate_lines_section_idx" ON "estimate_lines"("section");
