-- CreateEnum
CREATE TYPE "KpiMonthlyStatus" AS ENUM ('draft', 'pending', 'finalized');

-- CreateTable
CREATE TABLE "engineer_salary_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "salary_max" DECIMAL(15,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "engineer_salary_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineer_salary_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "config_id" UUID NOT NULL,
    "salary_max" DECIMAL(15,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "change_reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" UUID NOT NULL,

    CONSTRAINT "engineer_salary_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineer_kpi_monthly" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "score_schedule" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "score_qc" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "score_report" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "score_customer" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "score_contribution" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "contribution_note" TEXT,
    "contribution_by" UUID,
    "contribution_at" TIMESTAMP(3),
    "total_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "salary_max" DECIMAL(15,2) NOT NULL,
    "base_salary" DECIMAL(15,2) NOT NULL,
    "bonus_max" DECIMAL(15,2) NOT NULL,
    "bonus_ratio" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bonus_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_salary" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "schedule_details" JSONB,
    "qc_details" JSONB,
    "report_details" JSONB,
    "customer_details" JSONB,
    "status" "KpiMonthlyStatus" NOT NULL DEFAULT 'draft',
    "finalized_at" TIMESTAMP(3),
    "finalized_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engineer_kpi_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "engineer_salary_configs_user_id_key" ON "engineer_salary_configs"("user_id");

-- CreateIndex
CREATE INDEX "engineer_salary_configs_is_active_idx" ON "engineer_salary_configs"("is_active");

-- CreateIndex
CREATE INDEX "engineer_salary_history_config_id_idx" ON "engineer_salary_history"("config_id");

-- CreateIndex
CREATE INDEX "engineer_salary_history_changed_at_idx" ON "engineer_salary_history"("changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "engineer_kpi_monthly_user_id_year_month_key" ON "engineer_kpi_monthly"("user_id", "year", "month");

-- CreateIndex
CREATE INDEX "engineer_kpi_monthly_year_month_idx" ON "engineer_kpi_monthly"("year", "month");

-- CreateIndex
CREATE INDEX "engineer_kpi_monthly_status_idx" ON "engineer_kpi_monthly"("status");

-- AddForeignKey
ALTER TABLE "engineer_salary_configs" ADD CONSTRAINT "engineer_salary_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineer_salary_configs" ADD CONSTRAINT "engineer_salary_configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineer_salary_history" ADD CONSTRAINT "engineer_salary_history_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "engineer_salary_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineer_salary_history" ADD CONSTRAINT "engineer_salary_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineer_kpi_monthly" ADD CONSTRAINT "engineer_kpi_monthly_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineer_kpi_monthly" ADD CONSTRAINT "engineer_kpi_monthly_contribution_by_fkey" FOREIGN KEY ("contribution_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineer_kpi_monthly" ADD CONSTRAINT "engineer_kpi_monthly_finalized_by_fkey" FOREIGN KEY ("finalized_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
