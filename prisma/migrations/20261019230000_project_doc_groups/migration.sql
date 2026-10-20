-- Hồ sơ dự án nhóm theo chức năng (Bản vẽ / HĐ chủ nhà / HĐ thầu phụ / HD giám sát / HD kế toán + nhóm admin tự tạo).
-- project_id NULL = nhóm mẫu (copy sang dự án khi dự án chưa có nhóm nào).
-- Quyền xem gắn theo nhóm: file access_mode='group' theo quyền nhóm; 'custom' = chỉ người được cấp riêng (accessList).
CREATE TABLE "project_doc_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID,
    "system_key" VARCHAR(30),
    "name" TEXT NOT NULL,
    "icon" VARCHAR(16) NOT NULL DEFAULT '📁',
    "description" TEXT,
    "subfolders" JSONB NOT NULL DEFAULT '[]',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "perm_engineer" BOOLEAN NOT NULL DEFAULT false,
    "perm_accountant" BOOLEAN NOT NULL DEFAULT false,
    "perm_subcontractor" BOOLEAN NOT NULL DEFAULT false,
    "perm_customer" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_doc_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_doc_groups_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "project_doc_groups_project_id_display_order_idx" ON "project_doc_groups"("project_id", "display_order");
CREATE UNIQUE INDEX "project_doc_groups_project_system_key_uq" ON "project_doc_groups"("project_id", "system_key")
  WHERE "project_id" IS NOT NULL AND "system_key" IS NOT NULL;
CREATE UNIQUE INDEX "project_doc_groups_template_system_key_uq" ON "project_doc_groups"("system_key")
  WHERE "project_id" IS NULL AND "system_key" IS NOT NULL;

ALTER TABLE "project_documents"
  ADD COLUMN "group_id" UUID,
  ADD COLUMN "subfolder" VARCHAR(60),
  ADD COLUMN "status" VARCHAR(20),
  ADD COLUMN "access_mode" VARCHAR(10) NOT NULL DEFAULT 'group',
  ADD COLUMN "version_of_id" UUID,
  ADD COLUMN "version_no" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "is_current" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "project_documents"
  ADD CONSTRAINT "project_documents_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "project_doc_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "project_documents_version_of_id_fkey" FOREIGN KEY ("version_of_id") REFERENCES "project_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "project_documents_group_id_idx" ON "project_documents"("group_id");
CREATE INDEX "project_documents_version_of_id_idx" ON "project_documents"("version_of_id");

-- 5 nhóm mẫu mặc định
INSERT INTO "project_doc_groups" ("project_id","system_key","name","icon","description","subfolders","display_order","perm_engineer","perm_accountant","perm_subcontractor","perm_customer") VALUES
 (NULL,'ban_ve','Bản vẽ','📐','Bản vẽ thi công đã duyệt','["Mặt bằng","Kiến trúc","Kết cấu","Điện nước","Phối cảnh 3D"]',1,true,false,true,true),
 (NULL,'hd_chu_nha','HĐ chủ nhà','🏠','HĐTK · HĐ thi công · Phụ lục · Báo giá','["Hợp đồng","Phụ lục","Báo giá / Dự toán"]',2,false,true,false,true),
 (NULL,'hd_thau_phu','HĐ thầu phụ','🤝','Khoán nhân công · Nhà cung cấp','["Khoán nhân công","Nhà cung cấp"]',3,true,true,false,false),
 (NULL,'hd_giam_sat','Hướng dẫn giám sát','🦺','Kỹ thuật · Nghiệm thu · Biên bản mẫu','["Hướng dẫn","Biên bản mẫu"]',4,true,false,false,false),
 (NULL,'hd_ke_toan','Hướng dẫn kế toán','🧾','Đợt thu · Chi · Hoá đơn','[]',5,false,true,false,false);

-- Dự án chưa có nhóm → copy nhóm mẫu.
CREATE OR REPLACE FUNCTION ensure_project_doc_groups(pid UUID) RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM project_doc_groups WHERE project_id = pid) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('project_doc_groups:' || pid::text));
  IF EXISTS (SELECT 1 FROM project_doc_groups WHERE project_id = pid) THEN RETURN; END IF;
  INSERT INTO project_doc_groups (project_id, system_key, name, icon, description, subfolders, display_order,
    perm_engineer, perm_accountant, perm_subcontractor, perm_customer)
  SELECT pid, system_key, name, icon, description, subfolders, display_order,
    perm_engineer, perm_accountant, perm_subcontractor, perm_customer
  FROM project_doc_groups WHERE project_id IS NULL ORDER BY display_order;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION project_doc_default_group_key(cat TEXT) RETURNS TEXT AS $$
  SELECT CASE cat
    WHEN 'drawing' THEN 'ban_ve'
    WHEN 'contract' THEN 'hd_chu_nha'
    WHEN 'estimate' THEN 'hd_chu_nha'
    WHEN 'legal' THEN 'hd_chu_nha'
    ELSE 'hd_giam_sat' END
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION project_doc_default_subfolder(cat TEXT, step TEXT, title TEXT) RETURNS TEXT AS $$
  SELECT CASE
    WHEN step = 'mat_bang' THEN 'Mặt bằng'
    WHEN step = 'kien_truc' THEN 'Kiến trúc'
    WHEN step = 'ket_cau' THEN 'Kết cấu'
    WHEN step = 'dien_nuoc' THEN 'Điện nước'
    WHEN cat = 'estimate' THEN 'Báo giá / Dự toán'
    WHEN cat = 'contract' AND title ILIKE 'phụ lục%' THEN 'Phụ lục'
    WHEN cat = 'contract' AND title ILIKE '%báo giá%' THEN 'Báo giá / Dự toán'
    WHEN cat = 'contract' THEN 'Hợp đồng'
    WHEN cat = 'other' AND title ILIKE 'biên bản%' THEN 'Biên bản mẫu'
    WHEN cat = 'other' AND title ILIKE 'hướng dẫn%' THEN 'Hướng dẫn'
    ELSE NULL END
$$ LANGUAGE sql IMMUTABLE;

-- Ai/script nào chèn project_documents mà không ghi group_id (AI SQL, GĐ 4 Thiết kế, KS tải lên…) → tự xếp nhóm theo category.
CREATE OR REPLACE FUNCTION project_documents_assign_group() RETURNS trigger AS $$
BEGIN
  IF NEW.group_id IS NULL THEN
    PERFORM ensure_project_doc_groups(NEW.project_id);
    SELECT id INTO NEW.group_id FROM project_doc_groups
      WHERE project_id = NEW.project_id AND system_key = project_doc_default_group_key(NEW.category::text);
    IF NEW.subfolder IS NULL THEN
      NEW.subfolder := project_doc_default_subfolder(NEW.category::text, NEW.design_step, NEW.title);
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER project_documents_assign_group_trg
  BEFORE INSERT ON project_documents
  FOR EACH ROW EXECUTE FUNCTION project_documents_assign_group();

-- Backfill: dự án đã có hồ sơ → tạo nhóm + xếp file cũ.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT project_id FROM project_documents LOOP
    PERFORM ensure_project_doc_groups(r.project_id);
  END LOOP;
END $$;

UPDATE project_documents d SET
  group_id = g.id,
  subfolder = project_doc_default_subfolder(d.category::text, d.design_step, d.title)
FROM project_doc_groups g
WHERE g.project_id = d.project_id AND g.system_key = project_doc_default_group_key(d.category::text);

-- File đang chia sẻ chủ nhà khác mặc định nhóm → giữ nguyên, chuyển sang quyền riêng (CAD luôn ẩn khách, ko tính).
UPDATE project_documents d SET access_mode = 'custom'
FROM project_doc_groups g
WHERE g.id = d.group_id
  AND d.visible_to_customer <> g.perm_customer
  AND lower(d.file_name) !~ '\.(dwg|dxf|dwf|rvt|skp|zip|rar|7z)$';
