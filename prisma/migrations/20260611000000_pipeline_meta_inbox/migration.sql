-- CreateEnum
CREATE TYPE "InboxSource" AS ENUM ('manual', 'openclaw');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('open', 'done');

-- CreateTable
CREATE TABLE "customer_pipeline_meta" (
    "customer_key" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "next_action" TEXT,
    "next_action_due" DATE,
    "last_contact_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pipeline_meta_pkey" PRIMARY KEY ("customer_key")
);

-- CreateIndex
CREATE INDEX "customer_pipeline_meta_next_action_due_idx" ON "customer_pipeline_meta"("next_action_due");

-- CreateTable
CREATE TABLE "inbox_items" (
    "id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "source" "InboxSource" NOT NULL DEFAULT 'manual',
    "status" "InboxStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processed_by" UUID,
    "converted_to" TEXT,

    CONSTRAINT "inbox_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_items_status_created_at_idx" ON "inbox_items"("status", "created_at" DESC);
