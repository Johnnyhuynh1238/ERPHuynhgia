-- CreateTable
CREATE TABLE "web_events" (
    "id" BIGSERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "page_type" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "referer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_events_page_type_created_at_idx" ON "web_events"("page_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "web_events_session_id_created_at_idx" ON "web_events"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "web_events_event_type_created_at_idx" ON "web_events"("event_type", "created_at" DESC);
