-- CreateEnum
CREATE TYPE "SubcontractorType" AS ENUM ('individual', 'company');

-- CreateEnum
CREATE TYPE "SubcontractorStatus" AS ENUM ('active', 'inactive', 'blacklisted');

-- CreateEnum
CREATE TYPE "SubContractStatus" AS ENUM ('draft', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "SubContractUnit" AS ENUM ('lump_sum', 'per_m2', 'per_day', 'per_unit');

-- CreateEnum
CREATE TYPE "SubPaymentStatus" AS ENUM ('pending', 'requested', 'approved', 'paid', 'cancelled');

-- CreateTable
CREATE TABLE "subcontractor_specialties" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractor_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_criteria" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractors" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SubcontractorType" NOT NULL DEFAULT 'individual',
    "tax_code" TEXT,
    "phone" TEXT NOT NULL,
    "alt_phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "bank_name" TEXT,
    "bank_account" TEXT,
    "bank_account_name" TEXT,
    "status" "SubcontractorStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "avg_rating" DECIMAL(3,2),
    "total_contracts" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_specialty_map" (
    "id" UUID NOT NULL,
    "subcontractor_id" UUID NOT NULL,
    "specialty_id" UUID NOT NULL,

    CONSTRAINT "subcontractor_specialty_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_contracts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "subcontractor_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "scope_of_work" TEXT NOT NULL,
    "unit" "SubContractUnit" NOT NULL DEFAULT 'lump_sum',
    "unit_price" DECIMAL(15,2),
    "quantity" DECIMAL(10,2),
    "contract_value" DECIMAL(15,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "expected_end_date" DATE NOT NULL,
    "actual_end_date" DATE,
    "status" "SubContractStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_contract_tasks" (
    "id" UUID NOT NULL,
    "sub_contract_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,

    CONSTRAINT "sub_contract_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_contract_files" (
    "id" UUID NOT NULL,
    "sub_contract_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" UUID NOT NULL,

    CONSTRAINT "sub_contract_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_payments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sub_contract_id" UUID NOT NULL,
    "stage" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "linked_task_id" UUID,
    "expected_amount" DECIMAL(15,2) NOT NULL,
    "expected_date" DATE NOT NULL,
    "percentage" DECIMAL(5,2),
    "actual_amount" DECIMAL(15,2),
    "actual_paid_date" DATE,
    "status" "SubPaymentStatus" NOT NULL DEFAULT 'pending',
    "requested_by" UUID,
    "requested_at" TIMESTAMP(3),
    "request_note" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "approve_note" TEXT,
    "paid_by" UUID,
    "paid_at" TIMESTAMP(3),
    "receipt_url" TEXT,
    "pay_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_evaluations" (
    "id" UUID NOT NULL,
    "sub_contract_id" UUID NOT NULL,
    "evaluator_id" UUID NOT NULL,
    "overall_rating" DECIMAL(3,2) NOT NULL,
    "comment" TEXT,
    "will_hire_again" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_evaluation_scores" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "criterion_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "sub_evaluation_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subcontractor_specialties_code_key" ON "subcontractor_specialties"("code");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_criteria_code_key" ON "evaluation_criteria"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subcontractors_code_key" ON "subcontractors"("code");

-- CreateIndex
CREATE INDEX "subcontractors_status_idx" ON "subcontractors"("status");

-- CreateIndex
CREATE INDEX "subcontractors_is_active_idx" ON "subcontractors"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "subcontractor_specialty_map_subcontractor_id_specialty_id_key" ON "subcontractor_specialty_map"("subcontractor_id", "specialty_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_contracts_code_key" ON "sub_contracts"("code");

-- CreateIndex
CREATE INDEX "sub_contracts_project_id_idx" ON "sub_contracts"("project_id");

-- CreateIndex
CREATE INDEX "sub_contracts_subcontractor_id_idx" ON "sub_contracts"("subcontractor_id");

-- CreateIndex
CREATE INDEX "sub_contracts_status_idx" ON "sub_contracts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sub_contract_tasks_sub_contract_id_task_id_key" ON "sub_contract_tasks"("sub_contract_id", "task_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_payments_code_key" ON "sub_payments"("code");

-- CreateIndex
CREATE INDEX "sub_payments_sub_contract_id_idx" ON "sub_payments"("sub_contract_id");

-- CreateIndex
CREATE INDEX "sub_payments_status_idx" ON "sub_payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sub_evaluations_sub_contract_id_evaluator_id_key" ON "sub_evaluations"("sub_contract_id", "evaluator_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_evaluation_scores_evaluation_id_criterion_id_key" ON "sub_evaluation_scores"("evaluation_id", "criterion_id");

-- AddForeignKey
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_specialty_map" ADD CONSTRAINT "subcontractor_specialty_map_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_specialty_map" ADD CONSTRAINT "subcontractor_specialty_map_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "subcontractor_specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_contracts" ADD CONSTRAINT "sub_contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_contracts" ADD CONSTRAINT "sub_contracts_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "subcontractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_contracts" ADD CONSTRAINT "sub_contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_contract_tasks" ADD CONSTRAINT "sub_contract_tasks_sub_contract_id_fkey" FOREIGN KEY ("sub_contract_id") REFERENCES "sub_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_contract_tasks" ADD CONSTRAINT "sub_contract_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_contract_files" ADD CONSTRAINT "sub_contract_files_sub_contract_id_fkey" FOREIGN KEY ("sub_contract_id") REFERENCES "sub_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_contract_files" ADD CONSTRAINT "sub_contract_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_payments" ADD CONSTRAINT "sub_payments_sub_contract_id_fkey" FOREIGN KEY ("sub_contract_id") REFERENCES "sub_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_payments" ADD CONSTRAINT "sub_payments_linked_task_id_fkey" FOREIGN KEY ("linked_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_payments" ADD CONSTRAINT "sub_payments_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_payments" ADD CONSTRAINT "sub_payments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_payments" ADD CONSTRAINT "sub_payments_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_evaluations" ADD CONSTRAINT "sub_evaluations_sub_contract_id_fkey" FOREIGN KEY ("sub_contract_id") REFERENCES "sub_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_evaluations" ADD CONSTRAINT "sub_evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_evaluation_scores" ADD CONSTRAINT "sub_evaluation_scores_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "sub_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_evaluation_scores" ADD CONSTRAINT "sub_evaluation_scores_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "evaluation_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
