-- Add baogia_lead to StaffNotificationKind enum
ALTER TYPE "StaffNotificationKind" ADD VALUE 'baogia_lead';

-- New enum BaogiaLeadStatus
CREATE TYPE "BaogiaLeadStatus" AS ENUM ('new', 'contacted', 'signed', 'spam');

-- BaogiaLead table
CREATE TABLE "baogia_leads" (
  "id"           UUID                NOT NULL DEFAULT gen_random_uuid(),
  "name"         TEXT                NOT NULL,
  "phone"        TEXT                NOT NULL,
  "source"       TEXT                NOT NULL DEFAULT 'baogia_web',
  "session_id"   TEXT,
  "ip_address"   TEXT,
  "user_agent"   TEXT,
  "referer"      TEXT,
  "fee_total"    INTEGER,
  "payload"      JSONB               NOT NULL DEFAULT '{}',
  "status"       "BaogiaLeadStatus"  NOT NULL DEFAULT 'new',
  "admin_notes"  TEXT,
  "contacted_at" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3)        NOT NULL,
  CONSTRAINT "baogia_leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "baogia_leads_status_created_at_idx" ON "baogia_leads"("status", "created_at" DESC);
CREATE INDEX "baogia_leads_phone_idx" ON "baogia_leads"("phone");
