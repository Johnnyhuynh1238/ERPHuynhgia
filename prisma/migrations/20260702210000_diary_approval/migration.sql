-- Duyệt nhật ký thi công (chỉ ADMIN duyệt; sau duyệt KS không sửa được)
ALTER TABLE "construction_diaries"
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approved_by" UUID;

ALTER TABLE "construction_diaries"
  ADD CONSTRAINT "construction_diaries_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "construction_diaries_project_id_approved_at_idx"
  ON "construction_diaries" ("project_id", "approved_at" DESC);
