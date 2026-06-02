CREATE TABLE "ks_geo_error_log" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "action" VARCHAR(10),
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ks_geo_error_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ks_geo_error_log_user_id_created_at_idx" ON "ks_geo_error_log"("user_id", "created_at");
CREATE INDEX "ks_geo_error_log_created_at_idx" ON "ks_geo_error_log"("created_at");
