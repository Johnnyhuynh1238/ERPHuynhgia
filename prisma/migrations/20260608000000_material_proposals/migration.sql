-- Add material_proposal_new to StaffNotificationKind enum
ALTER TYPE "StaffNotificationKind" ADD VALUE 'material_proposal_new';

-- New enum MaterialProposalStatus
CREATE TYPE "MaterialProposalStatus" AS ENUM ('new', 'processed');

-- MaterialProposal table
CREATE TABLE "material_proposals" (
  "id"           UUID                       NOT NULL DEFAULT gen_random_uuid(),
  "ks_id"        UUID                       NOT NULL,
  "project_id"   UUID                       NOT NULL,
  "description"  TEXT                       NOT NULL,
  "status"       "MaterialProposalStatus"   NOT NULL DEFAULT 'new',
  "created_at"   TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "processed_by" UUID,
  CONSTRAINT "material_proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "material_proposals_ks_id_fkey"
    FOREIGN KEY ("ks_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "material_proposals_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "material_proposals_processed_by_fkey"
    FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX "material_proposals_project_id_status_idx" ON "material_proposals"("project_id", "status");
CREATE INDEX "material_proposals_ks_id_created_at_idx" ON "material_proposals"("ks_id", "created_at" DESC);
CREATE INDEX "material_proposals_status_created_at_idx" ON "material_proposals"("status", "created_at" DESC);
