-- Link xem nhật ký thi công cho chủ nhà (1 dự án + 1 ngày, hết hạn 7 ngày) + hàng chờ tin Zalo khách hàng.
CREATE TABLE IF NOT EXISTS "customer_diary_links" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "project_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_diary_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_diary_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "customer_diary_links_code_key" ON "customer_diary_links"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_diary_links_project_id_entry_date_key" ON "customer_diary_links"("project_id", "entry_date");

CREATE TABLE IF NOT EXISTS "customer_zalo_outbox" (
    "id" UUID NOT NULL,
    "dedupe_key" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "template_key" VARCHAR(64) NOT NULL,
    "project_id" UUID NOT NULL,
    "recipient_name" TEXT,
    "recipient_phone" VARCHAR(32),
    "message" TEXT NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'waiting_gateway',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    CONSTRAINT "customer_zalo_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_zalo_outbox_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "customer_zalo_outbox_dedupe_key_key" ON "customer_zalo_outbox"("dedupe_key");
CREATE INDEX IF NOT EXISTS "customer_zalo_outbox_status_created_at_idx" ON "customer_zalo_outbox"("status", "created_at");
CREATE INDEX IF NOT EXISTS "customer_zalo_outbox_project_id_idx" ON "customer_zalo_outbox"("project_id");
