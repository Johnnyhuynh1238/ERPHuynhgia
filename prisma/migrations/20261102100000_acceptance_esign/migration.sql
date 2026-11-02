-- BB nghiệm thu ký online (link Zalo, KS ký trước → khách ký trên màn hình → PDF đính mốc).
CREATE TABLE IF NOT EXISTS "acceptance_esigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "milestone_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ks_draft',
  "ks_token" VARCHAR(64) NOT NULL,
  "party_token" VARCHAR(64) NOT NULL,
  "content" JSONB NOT NULL,
  "ks_data" JSONB NOT NULL DEFAULT '{}',
  "ks_user_id" UUID,
  "ks_name" TEXT,
  "ks_zalo_id" TEXT,
  "ks_signature" TEXT,
  "ks_signed_at" TIMESTAMP(3),
  "ks_ip" TEXT,
  "ks_ua" TEXT,
  "party_name" TEXT,
  "party_phone" TEXT,
  "party_zalo_id" TEXT,
  "party_signature" TEXT,
  "party_signed_at" TIMESTAMP(3),
  "party_ip" TEXT,
  "party_ua" TEXT,
  "party_note" TEXT,
  "pdf_key" TEXT,
  "log" JSONB NOT NULL DEFAULT '[]',
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "acceptance_esigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "acceptance_esigns_milestone_id_fkey" FOREIGN KEY ("milestone_id")
    REFERENCES "acceptance_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "acceptance_esigns_ks_token_key" ON "acceptance_esigns"("ks_token");
CREATE UNIQUE INDEX IF NOT EXISTS "acceptance_esigns_party_token_key" ON "acceptance_esigns"("party_token");
CREATE INDEX IF NOT EXISTS "acceptance_esigns_milestone_id_status_idx" ON "acceptance_esigns"("milestone_id", "status");
CREATE INDEX IF NOT EXISTS "acceptance_esigns_project_id_status_idx" ON "acceptance_esigns"("project_id", "status");
