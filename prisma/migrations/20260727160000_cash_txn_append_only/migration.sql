-- Sổ quỹ append-only: khoá số liệu tài chính, cấm xoá.
-- Cách 2: chặn DELETE hoàn toàn + chặn UPDATE nếu đổi amount/direction/
-- occurred_at/account_id/balance_after. Vẫn cho sửa phân loại
-- (design_contract_id, category_id, note, attachment_urls...) để gắn HĐ.
-- Sai số tiền/ngày -> ghi bút toán đảo, KHÔNG sửa dòng cũ.
-- Chặn ở tầng DB nên app/AI/SQL tay đều không lách được.

CREATE OR REPLACE FUNCTION cash_txn_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'So quy append-only: khong duoc xoa giao dich (id=%). Sai thi ghi but toan dao.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.amount        IS DISTINCT FROM OLD.amount
  OR NEW.direction     IS DISTINCT FROM OLD.direction
  OR NEW.occurred_at   IS DISTINCT FROM OLD.occurred_at
  OR NEW.account_id    IS DISTINCT FROM OLD.account_id
  OR NEW.balance_after IS DISTINCT FROM OLD.balance_after THEN
    RAISE EXCEPTION 'So quy khoa so lieu: khong duoc sua amount/direction/occurred_at/account/balance (id=%). Chi sua duoc phan loai (HD, danh muc, ghi chu).', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cash_txn_append_only ON cash_transactions;
CREATE TRIGGER trg_cash_txn_append_only
  BEFORE UPDATE OR DELETE ON cash_transactions
  FOR EACH ROW EXECUTE FUNCTION cash_txn_append_only();
