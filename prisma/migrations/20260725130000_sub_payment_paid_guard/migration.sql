-- Chặn đứng ở tầng DB: đợt thanh toán thầu phụ KHÔNG được 'paid' khi trả chưa đủ.
-- Vấn đề gốc: mọi đường ghi SQL thẳng (AI thu-chi/mua hàng, sửa tay) đều set được
-- status='paid' dù actual_amount < expected_amount → đợt "đã chi" nhưng còn nợ,
-- nút gửi lệnh chi biến mất (điều kiện status != paid), tiền còn lại kẹt.
-- App (settleSubPaymentInstallment) đã đúng, nhưng SQL thẳng vòng qua nó.
--
-- Trigger BEFORE INSERT/UPDATE tự NẮN: paid mà chưa đủ → hạ về 'approved' (đang
-- tạm ứng dở), xoá paid_at/paid_by, GIỮ nguyên actual_amount. Bất kỳ ai ghi cỡ nào
-- DB cũng chốt trạng thái đúng — không dựa trí nhớ AI.
-- Dung sai 1đ khớp settleSubPaymentInstallment (newTotal >= expected - 1).

CREATE OR REPLACE FUNCTION sub_payment_paid_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'paid'
     AND NEW.actual_amount IS NOT NULL
     AND NEW.expected_amount > 0
     AND NEW.actual_amount < NEW.expected_amount - 1 THEN
    NEW.status  := 'approved';
    NEW.paid_at := NULL;
    NEW.paid_by := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sub_payment_paid_guard ON sub_payments;

CREATE TRIGGER trg_sub_payment_paid_guard
  BEFORE INSERT OR UPDATE ON sub_payments
  FOR EACH ROW
  EXECUTE FUNCTION sub_payment_paid_guard();
