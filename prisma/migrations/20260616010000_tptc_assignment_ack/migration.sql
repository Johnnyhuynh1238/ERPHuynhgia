-- TPTC assignment acknowledgement: KS xác nhận đã đọc + push lại về TPTC
ALTER TABLE "tptc_assignments" ADD COLUMN "acknowledged_at" TIMESTAMP(3);

ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'ks_tptc_acknowledged';
