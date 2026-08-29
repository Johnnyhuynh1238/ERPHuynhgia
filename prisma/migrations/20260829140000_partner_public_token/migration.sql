-- Link công khai chốt công nợ cho đối tác (NCC / thầu phụ): /doi-tac/[token].
-- Token random 48 hex, không gắn user — chỉ đọc, dùng để 2 bên đối chiếu số liệu.
ALTER TABLE "suppliers" ADD COLUMN "public_token" TEXT;
ALTER TABLE "subcontractors" ADD COLUMN "public_token" TEXT;

CREATE UNIQUE INDEX "suppliers_public_token_key" ON "suppliers"("public_token");
CREATE UNIQUE INDEX "subcontractors_public_token_key" ON "subcontractors"("public_token");
