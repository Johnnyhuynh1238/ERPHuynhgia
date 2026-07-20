-- Lệnh chi: link theo dõi công khai cho NCC + SĐT người nhận + nhiều ảnh CK
ALTER TABLE "expenses" ADD COLUMN "paid_receipt_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "expenses" ADD COLUMN "payee_phone" VARCHAR(20);
ALTER TABLE "expenses" ADD COLUMN "public_token" TEXT;

CREATE UNIQUE INDEX "expenses_public_token_key" ON "expenses"("public_token");
