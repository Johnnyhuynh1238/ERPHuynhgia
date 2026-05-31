-- CreateTable
CREATE TABLE "ks_attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "check_in_at" TIMESTAMP(3) NOT NULL,
    "check_in_lat" DECIMAL(10,7),
    "check_in_lng" DECIMAL(10,7),
    "check_in_accuracy" DECIMAL(10,2),
    "check_in_photo_key" TEXT,
    "check_out_at" TIMESTAMP(3),
    "check_out_lat" DECIMAL(10,7),
    "check_out_lng" DECIMAL(10,7),
    "check_out_accuracy" DECIMAL(10,2),
    "check_out_photo_key" TEXT,
    "duration_minutes" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ks_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ks_attendance_user_id_work_date_idx" ON "ks_attendance"("user_id", "work_date");

-- AddForeignKey
ALTER TABLE "ks_attendance" ADD CONSTRAINT "ks_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
