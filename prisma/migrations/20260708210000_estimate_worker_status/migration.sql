-- Heartbeat worker AI bóc KL (1 row, watcher host upsert mỗi phút)
CREATE TABLE "estimate_worker_status" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "state" VARCHAR(16) NOT NULL,
    "busy" BOOLEAN NOT NULL DEFAULT false,
    "tail" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_worker_status_pkey" PRIMARY KEY ("id")
);
