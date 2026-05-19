CREATE TABLE "customer_push_subscriptions" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_push_subscriptions_endpoint_key" ON "customer_push_subscriptions"("endpoint");
CREATE INDEX "customer_push_subscriptions_project_id_idx" ON "customer_push_subscriptions"("project_id");

ALTER TABLE "customer_push_subscriptions"
  ADD CONSTRAINT "customer_push_subscriptions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
