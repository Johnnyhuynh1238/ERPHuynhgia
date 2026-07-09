-- Thông tin riêng dạng ô text tự do từng dòng
ALTER TABLE "estimate_items" ADD COLUMN "fields" JSONB NOT NULL DEFAULT '[]';
-- Template trường riêng theo hạng mục (mảng nhãn)
ALTER TABLE "estimate_item_defaults" ADD COLUMN "fields" JSONB NOT NULL DEFAULT '[]';

-- Seed 10 trường riêng cho "Móng và nền trệt"
UPDATE "estimate_item_defaults" SET "fields" = '[
  "Loại móng (đơn/băng/bè/cọc)",
  "Số lượng móng",
  "Kích thước móng D×R×H",
  "Cao độ đáy móng",
  "Thép móng (Ø + khoảng cách)",
  "Diện tích nền",
  "Cao độ tôn nền + chiều dày đắp",
  "Vật liệu đắp (đất/cát/xà bần)",
  "Chiều dày nền BT",
  "Thép nền (Ø + khoảng cách)"
]'::jsonb WHERE "name" = 'Móng và nền trệt';
