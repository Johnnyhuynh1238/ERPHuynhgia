-- Chuẩn hoá tên ngân hàng ở tầng DB để không kênh nào (form, API, AI ghi SQL
-- thẳng) lưu được tên NH "bậy". Nguồn chân lý bảng tra: lib/vn-banks.ts
-- (findBankByName + BANK_ALIASES). Nếu sửa danh sách NH bên TS → cập nhật ở đây.
-- Không nhận diện được thì GIỮ NGUYÊN bản gõ (không nuốt dữ liệu), lệnh chi vẫn
-- dò lại bằng findBankByName khi tạo.

CREATE OR REPLACE FUNCTION normalize_bank_name(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  raw  text := btrim(coalesce(input, ''));
  key  text;
  key2 text;
  res  text;
BEGIN
  IF raw = '' THEN
    RETURN NULL;
  END IF;

  -- Chuẩn hoá: đ→d (NFD không tách đ), thường hoá, bỏ dấu (NFD + bỏ ký tự thừa).
  key := regexp_replace(normalize(translate(lower(raw), 'đ', 'd'), NFD), '[^a-z0-9]', '', 'g');
  IF key = '' THEN
    RETURN raw;
  END IF;

  -- Biến thể bỏ từ nhiễu "ngân hàng"/"bank"/tiền tố "nh".
  key2 := regexp_replace(replace(replace(key, 'nganhang', ''), 'bank', ''), '^nh', '');

  SELECT sn INTO res
  FROM (VALUES
    ('mb','MB Bank'),
    ('mbbank','MB Bank'),
    ('nganhangquandoi','MB Bank'),
    ('vcb','Vietcombank'),
    ('vietcombank','Vietcombank'),
    ('bidv','BIDV'),
    ('icb','VietinBank'),
    ('vietinbank','VietinBank'),
    ('tcb','Techcombank'),
    ('techcombank','Techcombank'),
    ('vpb','VPBank'),
    ('vpbank','VPBank'),
    ('acb','ACB'),
    ('stb','Sacombank'),
    ('sacombank','Sacombank'),
    ('tpb','TPBank'),
    ('tpbank','TPBank'),
    ('hdb','HDBank'),
    ('hdbank','HDBank'),
    ('ocb','OCB'),
    ('vccb','VietCapital'),
    ('vietcapital','VietCapital'),
    ('banviet','VietCapital'),
    ('vib','VIB'),
    ('shb','SHB'),
    ('msb','MSB'),
    ('vikki','Vikki'),
    ('vikkibankdonga','Vikki'),
    ('vba','Agribank'),
    ('agribank','Agribank'),
    ('bab','BacABank'),
    ('bacabank','BacABank'),
    ('pvcb','PVcomBank'),
    ('pvcombank','PVcomBank'),
    ('sgicb','Saigonbank'),
    ('saigonbank','Saigonbank'),
    ('abb','ABBank'),
    ('abbank','ABBank'),
    ('vab','VietABank'),
    ('vietabank','VietABank'),
    ('nab','NamABank'),
    ('namabank','NamABank'),
    ('scb','SCB'),
    ('eib','Eximbank'),
    ('eximbank','Eximbank'),
    ('vietbank','VietBank'),
    ('bvb','BaoVietBank'),
    ('baovietbank','BaoVietBank'),
    ('seab','SeABank'),
    ('seabank','SeABank'),
    ('hlbvn','HongLeong'),
    ('hongleong','HongLeong'),
    ('hongleongbank','HongLeong'),
    ('lpb','LienVietPost'),
    ('lienvietpost','LienVietPost'),
    ('lienvietpostbank','LienVietPost'),
    ('klb','KienLongBank'),
    ('kienlongbank','KienLongBank'),
    ('ibkhn','IBK HN'),
    ('ibkhanoi','IBK HN'),
    ('vietcom','Vietcombank'),
    ('techcom','Techcombank'),
    ('vietin','VietinBank'),
    ('viettin','VietinBank'),
    ('ctg','VietinBank'),
    ('quandoi','MB Bank'),
    ('mbb','MB Bank'),
    ('sacom','Sacombank'),
    ('tienphong','TPBank'),
    ('agri','Agribank'),
    ('vbard','Agribank'),
    ('maritime','MSB'),
    ('lienviet','LienVietPost'),
    ('phuongdong','OCB'),
    ('donga','Vikki'),
    ('dongabank','Vikki'),
    ('exim','Eximbank'),
    ('baoviet','BaoVietBank'),
    ('pvcom','PVcomBank'),
    ('kienlong','KienLongBank'),
    ('nama','NamABank'),
    ('baca','BacABank'),
    ('saigon','Saigonbank'),
    ('ngoaithuong','Vietcombank'),
    ('congthuong','VietinBank'),
    ('nongnghiep','Agribank'),
    ('dautuphattrien','BIDV'),
    ('daututphattrien','BIDV')
  ) AS m(k, sn)
  WHERE m.k = key OR m.k = key2
  ORDER BY (m.k = key) DESC
  LIMIT 1;

  RETURN COALESCE(res, raw);
END;
$$;

-- Trigger dùng chung: nắn bank_name trước khi ghi.
CREATE OR REPLACE FUNCTION trg_normalize_bank_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.bank_name := normalize_bank_name(NEW.bank_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subcontractors_norm_bank ON subcontractors;
CREATE TRIGGER trg_subcontractors_norm_bank
  BEFORE INSERT OR UPDATE OF bank_name ON subcontractors
  FOR EACH ROW EXECUTE FUNCTION trg_normalize_bank_name();

DROP TRIGGER IF EXISTS trg_suppliers_norm_bank ON suppliers;
CREATE TRIGGER trg_suppliers_norm_bank
  BEFORE INSERT OR UPDATE OF bank_name ON suppliers
  FOR EACH ROW EXECUTE FUNCTION trg_normalize_bank_name();

-- Backfill dữ liệu cũ đã lỡ lưu text tự do.
UPDATE subcontractors SET bank_name = normalize_bank_name(bank_name)
  WHERE bank_name IS NOT NULL AND btrim(bank_name) <> '';
UPDATE suppliers SET bank_name = normalize_bank_name(bank_name)
  WHERE bank_name IS NOT NULL AND btrim(bank_name) <> '';
