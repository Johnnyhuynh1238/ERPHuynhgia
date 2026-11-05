-- Tin ERP cho KS chuyển qua THƯ KÝ KỸ SƯ (lệnh sếp Zalo 09:24 05/11/2026, việc V261105-092526):
-- ERP ghi mọi tin cho KS vào hàng chờ "ks_tin_cho" (loại tin, dự án, mốc, link, giờ) cho thư ký đọc (chỉ đọc).
-- KS nào bật "ks_tin_qua_thu_ky" thì ERP thôi gửi Zalo thẳng; chưa bật (mặc định) thì ERP vẫn gửi như cũ.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ks_tin_qua_thu_ky" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ks_tin_cho" (
    "id" UUID NOT NULL,
    "ks_id" UUID NOT NULL,
    "loai" VARCHAR(32) NOT NULL,
    "project_id" UUID,
    "du_an" TEXT,
    "moc" TEXT,
    "link" TEXT,
    "noi_dung" TEXT NOT NULL,
    "ref_id" UUID,
    "han_luc" TIMESTAMP(3),
    "erp_gui_thang" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ks_tin_cho_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ks_tin_cho_ks_id_created_at_idx" ON "ks_tin_cho"("ks_id", "created_at");
