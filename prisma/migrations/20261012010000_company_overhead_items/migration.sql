-- Chi phí chung công ty hàng tháng (nhập tay) cho dự báo "đến khi xong các HĐ" ở Tài chính tổng quan.
CREATE TABLE "company_overhead_items" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "group_key" VARCHAR(20) NOT NULL DEFAULT 'van_hanh',
    "monthly_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_overhead_items_pkey" PRIMARY KEY ("id")
);

-- Số anh chốt 12/10/2026 (bình quân sổ quỹ T8–T10, đã bỏ trả nợ gốc / tạm ứng / khoản 1 lần).
INSERT INTO "company_overhead_items" ("id", "name", "group_key", "monthly_amount", "note", "sort_order") VALUES
  (gen_random_uuid(), 'Lương kỹ sư Phúc',                 'van_hanh',     17500000, NULL, 10),
  (gen_random_uuid(), 'Lương kế toán Nguyệt',             'van_hanh',      7000000, NULL, 20),
  (gen_random_uuid(), 'Thuê văn phòng / nhà (anh Út)',    'van_hanh',      5000000, NULL, 30),
  (gen_random_uuid(), 'Điện, Viettel',                    'van_hanh',      1400000, NULL, 40),
  (gen_random_uuid(), 'Marketing, CTV dựng video',        'van_hanh',      1500000, NULL, 50),
  (gen_random_uuid(), 'Nhân công lặt vặt (Zalo Bot)',     'van_hanh',      2000000, NULL, 60),
  (gen_random_uuid(), 'Vận hành',                         'van_hanh',      1000000, NULL, 70),
  (gen_random_uuid(), 'Lãi vay',                          'no_tai_chinh',  4000000, 'Từ T10/2026 chỉ còn ~4tr/tháng', 110),
  (gen_random_uuid(), 'Phí đáo hạn thẻ',                  'no_tai_chinh',  1500000, 'Hàng tháng', 120),
  (gen_random_uuid(), 'Trả góp xe (Bảy)',                 'no_tai_chinh',  7500000, 'Cố định hàng tháng', 130),
  (gen_random_uuid(), 'Lương anh Cường (chi qua Luận)',   'ca_nhan',       5000000, 'Không cố định, lấy khi cần', 210),
  (gen_random_uuid(), 'Tiền chợ, gia đình (Nguyệt)',      'ca_nhan',       6000000, NULL, 220),
  (gen_random_uuid(), 'Học phí (Trường Sumi)',            'ca_nhan',       2200000, NULL, 230),
  (gen_random_uuid(), 'Lặt vặt cá nhân',                  'ca_nhan',       2000000, 'Ăn uống, siêu thị, xăng…', 240);
