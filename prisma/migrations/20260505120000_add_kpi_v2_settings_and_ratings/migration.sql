-- AlterTable
ALTER TABLE "task_qc_results"
ADD COLUMN "passed_at_first_attempt" BOOLEAN;

-- CreateTable
CREATE TABLE "kpi_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "weight_tien_do" INTEGER NOT NULL,
    "weight_qc" INTEGER NOT NULL,
    "weight_bao_cao" INTEGER NOT NULL,
    "weight_chu_nha" INTEGER NOT NULL,
    "weight_dong_gop" INTEGER NOT NULL,
    "effective_from_month" TEXT NOT NULL,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "kpi_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "kpi_settings_weights_range_check" CHECK (
        "weight_tien_do" BETWEEN 0 AND 100 AND
        "weight_qc" BETWEEN 0 AND 100 AND
        "weight_bao_cao" BETWEEN 0 AND 100 AND
        "weight_chu_nha" BETWEEN 0 AND 100 AND
        "weight_dong_gop" BETWEEN 0 AND 100
    ),
    CONSTRAINT "kpi_settings_weights_total_check" CHECK (
        "weight_tien_do" + "weight_qc" + "weight_bao_cao" + "weight_chu_nha" + "weight_dong_gop" = 100
    )
);

-- CreateTable
CREATE TABLE "customer_task_ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "ks_user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "note" TEXT,
    "rated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_task_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_task_ratings_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

-- CreateTable
CREATE TABLE "customer_ks_ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "ks_user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "rating_expertise" INTEGER NOT NULL,
    "rating_attitude" INTEGER NOT NULL,
    "rating_communication" INTEGER NOT NULL,
    "note" TEXT,
    "rated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_ks_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_ks_ratings_rating_check" CHECK (
        "rating_expertise" BETWEEN 1 AND 5 AND
        "rating_attitude" BETWEEN 1 AND 5 AND
        "rating_communication" BETWEEN 1 AND 5
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "kpi_settings_effective_from_month_key" ON "kpi_settings"("effective_from_month");

-- CreateIndex
CREATE INDEX "kpi_settings_effective_from_month_idx" ON "kpi_settings"("effective_from_month");

-- CreateIndex
CREATE UNIQUE INDEX "customer_task_ratings_task_id_key" ON "customer_task_ratings"("task_id");

-- CreateIndex
CREATE INDEX "customer_task_ratings_ks_user_id_rated_at_idx" ON "customer_task_ratings"("ks_user_id", "rated_at");

-- CreateIndex
CREATE INDEX "customer_task_ratings_project_id_idx" ON "customer_task_ratings"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_ks_ratings_task_id_key" ON "customer_ks_ratings"("task_id");

-- CreateIndex
CREATE INDEX "customer_ks_ratings_ks_user_id_rated_at_idx" ON "customer_ks_ratings"("ks_user_id", "rated_at");

-- CreateIndex
CREATE INDEX "customer_ks_ratings_project_id_idx" ON "customer_ks_ratings"("project_id");

-- AddForeignKey
ALTER TABLE "kpi_settings" ADD CONSTRAINT "kpi_settings_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_task_ratings" ADD CONSTRAINT "customer_task_ratings_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_task_ratings" ADD CONSTRAINT "customer_task_ratings_ks_user_id_fkey" FOREIGN KEY ("ks_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_task_ratings" ADD CONSTRAINT "customer_task_ratings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_ks_ratings" ADD CONSTRAINT "customer_ks_ratings_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_ks_ratings" ADD CONSTRAINT "customer_ks_ratings_ks_user_id_fkey" FOREIGN KEY ("ks_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_ks_ratings" ADD CONSTRAINT "customer_ks_ratings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default settings when an admin exists
INSERT INTO "kpi_settings" (
    "weight_tien_do",
    "weight_qc",
    "weight_bao_cao",
    "weight_chu_nha",
    "weight_dong_gop",
    "effective_from_month",
    "changed_by",
    "reason"
)
SELECT
    30,
    40,
    10,
    10,
    10,
    to_char(CURRENT_DATE, 'YYYY-MM'),
    "id",
    'Default KPI v2 settings'
FROM "users"
WHERE "role" = 'admin'
ORDER BY "created_at" ASC
LIMIT 1
ON CONFLICT ("effective_from_month") DO NOTHING;
