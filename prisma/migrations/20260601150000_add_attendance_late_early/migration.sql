-- AlterTable
ALTER TABLE "ks_attendance"
ADD COLUMN "late_minutes" INTEGER,
ADD COLUMN "early_leave_minutes" INTEGER,
ADD COLUMN "shift_id_at_check_in" UUID,
ADD COLUMN "shift_id_at_check_out" UUID;
