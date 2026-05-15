-- Allow expected_date and day_offset to be NULL when due date is not yet known.
ALTER TABLE "payment_schedules" ALTER COLUMN "expected_date" DROP NOT NULL;
ALTER TABLE "payment_schedules" ALTER COLUMN "day_offset" DROP NOT NULL;
