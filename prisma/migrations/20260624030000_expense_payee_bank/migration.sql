-- Thêm thông tin tài khoản thụ hưởng để KT bấm "Chuyển khoản" mở thẳng app NH

ALTER TABLE "expenses"
  ADD COLUMN "payee_bank_bin"        VARCHAR(20),
  ADD COLUMN "payee_account_number"  VARCHAR(40),
  ADD COLUMN "payee_account_name"    VARCHAR(200),
  ADD COLUMN "payee_qr_url"          TEXT;
