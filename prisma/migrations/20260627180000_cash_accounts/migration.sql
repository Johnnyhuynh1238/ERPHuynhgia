-- Multi-account sổ quỹ: tách CompanyCash singleton thành nhiều CashAccount
-- (Tiền mặt + Luận). Mọi CashTransaction phải gắn accountId; transfer dùng counterAccountId.

CREATE TYPE "CashAccountKind" AS ENUM ('cash', 'bank');

ALTER TYPE "CashTxnRefType" ADD VALUE IF NOT EXISTS 'transfer';

CREATE TABLE "cash_accounts" (
  "id"               UUID            NOT NULL DEFAULT gen_random_uuid(),
  "code"             VARCHAR(40)     NOT NULL,
  "name"             VARCHAR(200)    NOT NULL,
  "kind"             "CashAccountKind" NOT NULL,
  "opening_balance"  DECIMAL(18, 2)  NOT NULL DEFAULT 0,
  "current_balance"  DECIMAL(18, 2)  NOT NULL DEFAULT 0,
  "sort_order"       INTEGER         NOT NULL DEFAULT 0,
  "active"           BOOLEAN         NOT NULL DEFAULT true,
  "created_at"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3)    NOT NULL,

  CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cash_accounts_code_key" ON "cash_accounts"("code");
CREATE INDEX "cash_accounts_active_sort_order_idx" ON "cash_accounts"("active", "sort_order");

-- Seed 2 tài khoản hardcoded: kế thừa số dư hiện tại của company_cash vào "Tiền mặt".
INSERT INTO "cash_accounts" ("code", "name", "kind", "opening_balance", "current_balance", "sort_order", "active", "updated_at")
SELECT
  'CASH',
  'Tiền mặt',
  'cash'::"CashAccountKind",
  COALESCE("opening_balance", 0),
  COALESCE("current_balance", 0),
  0,
  true,
  NOW()
FROM "company_cash"
LIMIT 1;

-- Nếu company_cash chưa có row nào (chưa khởi tạo) thì vẫn cần seed Tiền mặt rỗng để các backfill txn (nếu có) gắn vào.
INSERT INTO "cash_accounts" ("code", "name", "kind", "opening_balance", "current_balance", "sort_order", "active", "updated_at")
SELECT 'CASH', 'Tiền mặt', 'cash'::"CashAccountKind", 0, 0, 0, true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "cash_accounts" WHERE "code" = 'CASH');

INSERT INTO "cash_accounts" ("code", "name", "kind", "opening_balance", "current_balance", "sort_order", "active", "updated_at")
VALUES ('LUAN', 'Luận', 'bank'::"CashAccountKind", 0, 0, 1, true, NOW())
ON CONFLICT ("code") DO NOTHING;

-- Thêm cột accountId + counterAccountId vào cash_transactions, backfill về Tiền mặt.
ALTER TABLE "cash_transactions"
  ADD COLUMN "account_id"         UUID,
  ADD COLUMN "counter_account_id" UUID;

UPDATE "cash_transactions"
SET "account_id" = (SELECT "id" FROM "cash_accounts" WHERE "code" = 'CASH' LIMIT 1)
WHERE "account_id" IS NULL;

ALTER TABLE "cash_transactions" ALTER COLUMN "account_id" SET NOT NULL;

ALTER TABLE "cash_transactions"
  ADD CONSTRAINT "cash_transactions_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
  ADD CONSTRAINT "cash_transactions_counter_account_id_fkey"
    FOREIGN KEY ("counter_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "cash_transactions_account_id_occurred_at_idx"
  ON "cash_transactions"("account_id", "occurred_at" DESC);
