-- Đồng bộ NCC cho đơn mua hàng ở MỌI đường ghi (API, AI ghi SQL thẳng, sửa tay).
-- Vấn đề gốc: đơn có supplier_name (text) nhưng supplier_id NULL → NCC hiện ở list
-- (đọc tên) nhưng mất ở detail + view công nợ (join theo supplier_id, lọc IS NOT NULL).
-- Trigger BEFORE INSERT/UPDATE bảo đảm: có NCC ⇒ luôn có supplier_id + tên canonical.

CREATE OR REPLACE FUNCTION mh_orders_fill_supplier() RETURNS trigger AS $$
DECLARE
  sid uuid;
  nm  text;
BEGIN
  -- Có supplier_id → đồng bộ tên theo danh mục (nguồn chuẩn).
  IF NEW.supplier_id IS NOT NULL THEN
    SELECT name INTO nm FROM suppliers WHERE id = NEW.supplier_id;
    IF nm IS NOT NULL THEN
      NEW.supplier_name := nm;
    END IF;
    RETURN NEW;
  END IF;

  -- Chỉ có tên (NCC gõ tay) → tìm theo tên, chưa có thì tạo mới, rồi gán id.
  IF NEW.supplier_name IS NOT NULL AND btrim(NEW.supplier_name) <> '' THEN
    SELECT id INTO sid
      FROM suppliers
     WHERE lower(name) = lower(btrim(NEW.supplier_name))
     LIMIT 1;

    IF sid IS NULL THEN
      INSERT INTO suppliers (id, code, name, is_active, created_by, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        'NCC' || lpad(
          ((COALESCE(
              (SELECT max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int)
                 FROM suppliers WHERE code LIKE 'NCC%'),
              0)) + 1)::text, 4, '0'),
        btrim(NEW.supplier_name),
        true,
        NEW.created_by,
        now(),
        now()
      )
      RETURNING id INTO sid;
    END IF;

    NEW.supplier_id   := sid;
    NEW.supplier_name := (SELECT name FROM suppliers WHERE id = sid);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mh_orders_fill_supplier ON mh_orders;
CREATE TRIGGER trg_mh_orders_fill_supplier
  BEFORE INSERT OR UPDATE OF supplier_name, supplier_id ON mh_orders
  FOR EACH ROW EXECUTE FUNCTION mh_orders_fill_supplier();

-- Backfill đơn orphan hiện có (tên có, id NULL) — link/tạo NCC cho đồng bộ ngược.
UPDATE mh_orders SET supplier_name = supplier_name
 WHERE supplier_name IS NOT NULL AND supplier_id IS NULL;
