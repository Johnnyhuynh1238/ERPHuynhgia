-- Enums for HĐ Thiết kế
CREATE TYPE "DesignContractStatus" AS ENUM ('active', 'done', 'cancelled');
CREATE TYPE "DesignContractStepKind" AS ENUM ('mat_bang', 'mat_tien_3d', 'noi_that', 'shop_drawing');
CREATE TYPE "DesignContractStepStatus" AS ENUM ('pending', 'in_progress', 'customer_review', 'approved');

-- Bảng HĐ Thiết kế
CREATE TABLE "design_contracts" (
  "id"             UUID NOT NULL,
  "customer_name"  TEXT NOT NULL,
  "customer_phone" TEXT NOT NULL,
  "lead_id"        UUID,
  "project_id"     UUID,
  "signed_at"      DATE NOT NULL,
  "total_value"    DECIMAL(15,2),
  "status"         "DesignContractStatus" NOT NULL DEFAULT 'active',
  "notes"          TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "design_contracts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "design_contracts_project_id_key" ON "design_contracts"("project_id");
CREATE INDEX "design_contracts_status_signed_at_idx" ON "design_contracts"("status", "signed_at" DESC);
CREATE INDEX "design_contracts_customer_phone_idx" ON "design_contracts"("customer_phone");

ALTER TABLE "design_contracts"
  ADD CONSTRAINT "design_contracts_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "baogia_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "design_contracts"
  ADD CONSTRAINT "design_contracts_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bảng 4 sub-step của HĐ Thiết kế
CREATE TABLE "design_contract_steps" (
  "id"          UUID NOT NULL,
  "contract_id" UUID NOT NULL,
  "kind"        "DesignContractStepKind" NOT NULL,
  "status"      "DesignContractStepStatus" NOT NULL DEFAULT 'pending',
  "approved_at" TIMESTAMP(3),
  "notes"       TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "design_contract_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "design_contract_steps_contract_id_kind_key" ON "design_contract_steps"("contract_id", "kind");
CREATE INDEX "design_contract_steps_contract_id_idx" ON "design_contract_steps"("contract_id");

ALTER TABLE "design_contract_steps"
  ADD CONSTRAINT "design_contract_steps_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "design_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
