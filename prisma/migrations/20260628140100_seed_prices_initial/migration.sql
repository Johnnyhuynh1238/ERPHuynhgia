-- Seed đơn giá thị trường tham khảo 2026 (TP.HCM, miền Nam)
-- Lưu ý: anh chỉnh sau theo báo giá NCC thực tế

-- ===== Material Prices (đồng / đơn vị) =====
INSERT INTO material_prices (name, unit, price, source, updated_at) VALUES
  ('Xi măng PCB30', 'kg', 1700, 'Thị trường HCM 2026', NOW()),
  ('Xi măng PCB40', 'kg', 2000, 'Thị trường HCM 2026', NOW()),
  ('Cát vàng', 'm³', 350000, 'Cát vàng đổ bê tông HCM', NOW()),
  ('Cát đắp nền', 'm³', 180000, 'Cát san lấp đầm chặt', NOW()),
  ('Đá dăm 1x2', 'm³', 380000, 'Đá 1x2 đổ bê tông', NOW()),
  ('Đá dăm 4x6', 'm³', 320000, 'Đá 4x6 lót móng', NOW()),
  ('Nước', 'lít', 30, 'Nước thủy cục', NOW()),
  ('Lưới che HDPE', 'm²', 18000, 'Lưới che bụi giàn giáo', NOW()),
  ('Cây giàn giáo', 'cây', 35000, 'Thuê giàn giáo thép Φ48 - giá 1 cây/tháng', NOW()),
  ('Dây buộc', 'kg', 25000, 'Dây buộc giàn giáo, lưới', NOW()),
  ('Bạt lót', 'm²', 15000, 'Bạt PE/PP lót móng', NOW()),
  ('Thép tròn ≤10mm', 'kg', 17500, 'Thép Việt Mỹ/Hòa Phát 2026', NOW()),
  ('Thép tròn ≤18mm', 'kg', 17000, 'Thép Hòa Phát Φ12-18 2026', NOW()),
  ('Dây thép buộc', 'kg', 28000, 'Dây thép 1ly buộc thép', NOW()),
  ('Gỗ ván cốp pha', 'm³', 4500000, 'Gỗ thông/cao su đóng cốp pha', NOW()),
  ('Đinh các loại', 'kg', 32000, 'Đinh 3-10cm', NOW()),
  ('Gạch đặc', 'viên', 1500, 'Gạch đất nung đặc 75x110x220', NOW()),
  ('Sikatop Seal 107 (hoặc tương đương)', 'kg', 75000, 'Sika Seal 107 thùng 25kg', NOW());

-- ===== Labor Prices (đồng / công - 1 ngày làm việc) =====
INSERT INTO labor_prices (grade, price, source, updated_at) VALUES
  ('3.0', 380000, 'Thợ phụ / Bậc 3.0 - HCM 2026', NOW()),
  ('3.5', 420000, 'Thợ chính bậc 3.5 - HCM 2026', NOW()),
  ('4.0', 460000, 'Thợ chính bậc 4.0 - HCM 2026', NOW()),
  ('4.5', 500000, 'Thợ giỏi bậc 4.5 - HCM 2026', NOW()),
  ('5.0', 550000, 'Thợ tay nghề cao bậc 5.0', NOW());

-- ===== Machine Prices (đồng / ca = 8 tiếng) =====
INSERT INTO machine_prices (name, price, source, updated_at) VALUES
  ('Máy đào 0,8m³', 2800000, 'Thuê máy đào cuốc 0,8m³ - ca 8h', NOW()),
  ('Máy đầm bàn', 350000, 'Đầm bàn 1kW - bao xăng', NOW()),
  ('Máy đầm dùi 1.5kW', 380000, 'Đầm dùi BT 1.5kW', NOW()),
  ('Máy trộn bê tông 250L', 450000, 'Trộn BT 250L - bao xăng', NOW()),
  ('Máy trộn vữa 80L', 320000, 'Trộn vữa 80L', NOW()),
  ('Máy bơm bê tông cần/tự hành', 4500000, 'Bơm cần 28-32m hoặc bơm tự hành', NOW()),
  ('Máy cắt uốn thép', 480000, 'Máy cắt uốn thép Φ4-32', NOW()),
  ('Máy hàn 23kW', 420000, 'Máy hàn que 23kW', NOW());
