-- Mốc nghiệm thu chủ nhà ký trên cổng CN (BB chỉ cần CN ký)
CREATE TYPE "AcceptanceMilestoneStatus" AS ENUM ('pending', 'signed');

CREATE TABLE "acceptance_milestones" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "seq" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "AcceptanceMilestoneStatus" NOT NULL DEFAULT 'pending',
  "signature_url" TEXT,
  "signer_name" TEXT,
  "signed_at" TIMESTAMP(3),
  "ip_address" TEXT,
  "user_agent" TEXT,
  "customer_note" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "acceptance_milestones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "acceptance_milestones_project_id_seq_idx"
  ON "acceptance_milestones" ("project_id", "seq");

CREATE INDEX "acceptance_milestones_project_id_status_idx"
  ON "acceptance_milestones" ("project_id", "status");

ALTER TABLE "acceptance_milestones"
  ADD CONSTRAINT "acceptance_milestones_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "acceptance_milestones"
  ADD CONSTRAINT "acceptance_milestones_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
