-- Reset 1 row test cũ trước khi rename enum
DELETE FROM "material_proposals";

-- Đổi enum MaterialProposalStatus: new->pending, processed->accepted, thêm declined
ALTER TYPE "MaterialProposalStatus" RENAME VALUE 'new' TO 'pending';
ALTER TYPE "MaterialProposalStatus" RENAME VALUE 'processed' TO 'accepted';
ALTER TYPE "MaterialProposalStatus" ADD VALUE 'declined';

-- Đổi default của cột status sang pending
ALTER TABLE "material_proposals" ALTER COLUMN "status" SET DEFAULT 'pending';

-- Enum mới cho trạng thái đơn hàng thực tế
CREATE TYPE "MaterialOrderStatus" AS ENUM ('not_ordered', 'ordered', 'received', 'paid');

-- Bổ sung cột cho workflow
ALTER TABLE "material_proposals"
  ADD COLUMN "order_status"      "MaterialOrderStatus" NOT NULL DEFAULT 'not_ordered',
  ADD COLUMN "parsed_items"      JSONB,
  ADD COLUMN "processed_note"    TEXT,
  ADD COLUMN "payment_method"    TEXT,
  ADD COLUMN "payment_note"      TEXT,
  ADD COLUMN "accepted_at"       TIMESTAMP(3),
  ADD COLUMN "ordered_at"        TIMESTAMP(3),
  ADD COLUMN "received_at"       TIMESTAMP(3),
  ADD COLUMN "paid_at"           TIMESTAMP(3),
  ADD COLUMN "reminder_due_at"   TIMESTAMP(3);

-- Index phục vụ filter của kế toán
CREATE INDEX "material_proposals_order_status_idx" ON "material_proposals"("order_status");

-- Index riêng cho cron quét reminder (partial index để nhẹ)
CREATE INDEX "material_proposals_reminder_due_at_idx"
  ON "material_proposals"("reminder_due_at")
  WHERE "reminder_due_at" IS NOT NULL;

-- Thêm enum value notif: update (mọi đổi status) + reminder (cron 5p)
ALTER TYPE "StaffNotificationKind" ADD VALUE 'material_proposal_update';
ALTER TYPE "StaffNotificationKind" ADD VALUE 'material_proposal_reminder';
