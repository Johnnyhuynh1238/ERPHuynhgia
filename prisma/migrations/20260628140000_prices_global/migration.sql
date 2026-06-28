-- CreateTable
CREATE TABLE "material_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "price" BIGINT NOT NULL,
    "source" VARCHAR(255),
    "note" TEXT,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labor_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grade" VARCHAR(16) NOT NULL,
    "price" BIGINT NOT NULL,
    "source" VARCHAR(255),
    "note" TEXT,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labor_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "price" BIGINT NOT NULL,
    "source" VARCHAR(255),
    "note" TEXT,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_prices_name_unit_key" ON "material_prices"("name", "unit");
CREATE INDEX "material_prices_retired_at_idx" ON "material_prices"("retired_at");

CREATE UNIQUE INDEX "labor_prices_grade_key" ON "labor_prices"("grade");
CREATE INDEX "labor_prices_retired_at_idx" ON "labor_prices"("retired_at");

CREATE UNIQUE INDEX "machine_prices_name_key" ON "machine_prices"("name");
CREATE INDEX "machine_prices_retired_at_idx" ON "machine_prices"("retired_at");
