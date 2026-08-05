-- Báo giá + dự toán gắn vào HĐ thiết kế (bước cuối).
-- 1) Thêm bước 'du_toan_bao_gia' vào enum các bước thiết kế.
-- 2) Cột quote_data (JSONB) + quote_updated_at trên design_contracts lưu cục DATA báo giá.
-- Không dùng giá trị enum mới trong cùng migration (step 5 backfill lazy ở tầng app).

-- ── 1. Enum bước ─────────────────────────────────────────────────────────────
ALTER TYPE "DesignContractStepKind" ADD VALUE IF NOT EXISTS 'du_toan_bao_gia';

-- ── 2. Cột lưu báo giá + token chia sẻ công khai ─────────────────────────────
ALTER TABLE "design_contracts" ADD COLUMN IF NOT EXISTS "quote_data" JSONB;
ALTER TABLE "design_contracts" ADD COLUMN IF NOT EXISTS "quote_updated_at" TIMESTAMP(3);
ALTER TABLE "design_contracts" ADD COLUMN IF NOT EXISTS "quote_share_token" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "design_contracts_quote_share_token_key"
  ON "design_contracts" ("quote_share_token");

-- ── 3. Bảng phiên bản báo giá ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "design_contract_quote_versions" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "contract_id"   UUID         NOT NULL,
  "seq"           INTEGER      NOT NULL,
  "data"          JSONB        NOT NULL,
  "grand"         BIGINT,
  "note"          TEXT,
  "created_by_id" UUID,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "design_contract_quote_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "design_contract_quote_versions_contract_id_fkey"
    FOREIGN KEY ("contract_id") REFERENCES "design_contracts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "design_contract_quote_versions_contract_id_seq_key"
  ON "design_contract_quote_versions" ("contract_id", "seq");
CREATE INDEX IF NOT EXISTS "design_contract_quote_versions_contract_id_created_at_idx"
  ON "design_contract_quote_versions" ("contract_id", "created_at" DESC);
