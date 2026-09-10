-- Danh bạ đối tượng nhận tiền (Payee) — lưu lúc tạo Lệnh chi ngoài để lần sau
-- chọn 1 phát ra đủ thông tin chuyển khoản. Dùng chung toàn công ty.
CREATE TABLE "payees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(20),
    "bank_bin" VARCHAR(20),
    "account_number" VARCHAR(40),
    "account_name" VARCHAR(200),
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payees_pkey" PRIMARY KEY ("id")
);

-- Trùng cặp NH + số TK = cùng một đối tượng (upsert theo cặp này).
CREATE UNIQUE INDEX "payees_bank_bin_account_number_key" ON "payees" ("bank_bin", "account_number");
CREATE INDEX "payees_name_idx" ON "payees" ("name");

ALTER TABLE "payees" ADD CONSTRAINT "payees_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
