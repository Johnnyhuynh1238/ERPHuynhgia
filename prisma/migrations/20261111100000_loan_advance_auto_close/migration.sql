-- Tự TẤT TOÁN khoản vay / phiếu tạm ứng khi giao dịch đã trả đủ.
-- Vấn đề gốc: status chỉ đổi khi bấm tay "Đánh dấu trả xong" / "Tất toán" → khoản đã trả hết
-- vẫn 'active'/'open', báo cáo (Ban Kiểm soát, AI công nợ) báo còn nợ sai (11/11/2026 VAY-202610-0003).
-- Công thức khớp lib/debts.ts:
--   Vay: Σ expenses(loan_id, paid, danh mục ≠ LAIVAY).amount >= principal (dung sai 1đ) → 'paid'.
--   Tạm ứng: Σ expenses(advance_id, paid) > 0 và Σ receipts(advance_id, received) >= số đã chi (dung sai 1đ) → 'settled'.
-- Chỉ tự ĐÓNG, không tự mở lại (giữ quyền đóng/mở tay của admin; huỷ phiếu sau khi đóng → bấm "Mở lại").
-- Cột timestamp không tz, Prisma đọc như UTC → dùng now() at time zone 'UTC'.

CREATE OR REPLACE FUNCTION loan_auto_close(p_loan uuid) RETURNS void AS $$
  UPDATE loans l
     SET status = 'paid',
         closed_at = COALESCE(l.closed_at, now() at time zone 'UTC'),
         updated_at = now() at time zone 'UTC'
   WHERE l.id = p_loan
     AND l.status = 'active'
     AND l.principal > 0
     AND (SELECT COALESCE(SUM(e.amount), 0)
            FROM expenses e
            LEFT JOIN expense_categories c ON c.id = e.category_id
           WHERE e.loan_id = l.id
             AND e.status = 'paid'
             AND COALESCE(c.code, '') <> 'LAIVAY') >= l.principal - 1;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION advance_auto_settle(p_adv uuid) RETURNS void AS $$
  WITH s AS (
    SELECT (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e
             WHERE e.advance_id = p_adv AND e.status = 'paid') AS chi,
           (SELECT COALESCE(SUM(r.amount), 0) FROM receipts r
             WHERE r.advance_id = p_adv AND r.status = 'received') AS hoan
  )
  UPDATE advances a
     SET status = 'settled',
         settled_at = COALESCE(a.settled_at, now() at time zone 'UTC'),
         updated_at = now() at time zone 'UTC'
    FROM s
   WHERE a.id = p_adv
     AND a.status = 'open'
     AND s.chi > 0
     AND s.hoan >= s.chi - 1;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION expense_debt_auto_close() RETURNS trigger AS $$
BEGIN
  IF NEW.loan_id IS NOT NULL THEN PERFORM loan_auto_close(NEW.loan_id); END IF;
  IF NEW.advance_id IS NOT NULL THEN PERFORM advance_auto_settle(NEW.advance_id); END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION receipt_advance_auto_settle() RETURNS trigger AS $$
BEGIN
  IF NEW.advance_id IS NOT NULL THEN PERFORM advance_auto_settle(NEW.advance_id); END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expense_debt_auto_close ON expenses;
CREATE TRIGGER trg_expense_debt_auto_close
  AFTER INSERT OR UPDATE OF status, amount, loan_id, advance_id, category_id ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION expense_debt_auto_close();

DROP TRIGGER IF EXISTS trg_receipt_advance_auto_settle ON receipts;
CREATE TRIGGER trg_receipt_advance_auto_settle
  AFTER INSERT OR UPDATE OF status, amount, advance_id ON receipts
  FOR EACH ROW
  EXECUTE FUNCTION receipt_advance_auto_settle();

-- Nắn các khoản cũ đã trả đủ nhưng còn treo.
SELECT loan_auto_close(id) FROM loans WHERE status = 'active';
SELECT advance_auto_settle(id) FROM advances WHERE status = 'open';
