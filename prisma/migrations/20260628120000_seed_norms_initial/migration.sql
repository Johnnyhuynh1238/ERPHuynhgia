-- Seed bộ định mức cơ bản nhà ở dân dụng (~40 norm)
-- Nguồn: tham khảo Thông tư 12/2021/TT-BXD — Bộ Xây dựng
-- Lưu ý: số liệu mang tính tham khảo, anh chỉnh hệ số K khớp thực tế dự án.

INSERT INTO "norms" (code, name, unit, category, material_items, labor_items, machine_items, source) VALUES
-- ─── BÊ TÔNG ───
('BT.1110', 'Bê tông móng đá 1x2 vữa xi măng M250', 'm³', 'be_tong',
 $$[
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":415},
   {"name":"Cát vàng","unit":"m³","qtyPerUnit":0.45},
   {"name":"Đá dăm 1x2","unit":"m³","qtyPerUnit":0.85},
   {"name":"Nước","unit":"lít","qtyPerUnit":175}
 ]$$::jsonb,
 $$[{"grade":"3.0","qtyPerUnit":1.42}]$$::jsonb,
 $$[
   {"name":"Máy trộn bê tông 250L","qtyPerUnit":0.095},
   {"name":"Máy đầm dùi 1.5kW","qtyPerUnit":0.089}
 ]$$::jsonb,
 'TT 12/2021 BXD'),

('BT.1120', 'Bê tông cột đá 1x2 M250 (tiết diện ≤ 0.1m²)', 'm³', 'be_tong',
 $$[
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":415},
   {"name":"Cát vàng","unit":"m³","qtyPerUnit":0.45},
   {"name":"Đá dăm 1x2","unit":"m³","qtyPerUnit":0.85},
   {"name":"Nước","unit":"lít","qtyPerUnit":175}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":4.04}]$$::jsonb,
 $$[
   {"name":"Máy trộn bê tông 250L","qtyPerUnit":0.095},
   {"name":"Máy đầm dùi 1.5kW","qtyPerUnit":0.089}
 ]$$::jsonb,
 'TT 12/2021 BXD'),

('BT.1130', 'Bê tông dầm-sàn đá 1x2 M250', 'm³', 'be_tong',
 $$[
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":415},
   {"name":"Cát vàng","unit":"m³","qtyPerUnit":0.45},
   {"name":"Đá dăm 1x2","unit":"m³","qtyPerUnit":0.85},
   {"name":"Nước","unit":"lít","qtyPerUnit":175}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":2.30}]$$::jsonb,
 $$[
   {"name":"Máy trộn bê tông 250L","qtyPerUnit":0.095},
   {"name":"Máy đầm dùi 1.5kW","qtyPerUnit":0.089}
 ]$$::jsonb,
 'TT 12/2021 BXD'),

('BT.1140', 'Bê tông lót móng đá 4x6 M100', 'm³', 'be_tong',
 $$[
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":195},
   {"name":"Cát vàng","unit":"m³","qtyPerUnit":0.50},
   {"name":"Đá dăm 4x6","unit":"m³","qtyPerUnit":0.91},
   {"name":"Nước","unit":"lít","qtyPerUnit":165}
 ]$$::jsonb,
 $$[{"grade":"3.0","qtyPerUnit":1.18}]$$::jsonb,
 $$[{"name":"Máy trộn bê tông 250L","qtyPerUnit":0.085}]$$::jsonb,
 'TT 12/2021 BXD'),

('BT.1150', 'Bê tông cầu thang đá 1x2 M250', 'm³', 'be_tong',
 $$[
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":415},
   {"name":"Cát vàng","unit":"m³","qtyPerUnit":0.45},
   {"name":"Đá dăm 1x2","unit":"m³","qtyPerUnit":0.85},
   {"name":"Nước","unit":"lít","qtyPerUnit":175}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":2.85}]$$::jsonb,
 $$[
   {"name":"Máy trộn bê tông 250L","qtyPerUnit":0.095},
   {"name":"Máy đầm dùi 1.5kW","qtyPerUnit":0.089}
 ]$$::jsonb,
 'TT 12/2021 BXD'),

-- ─── CỐT THÉP ───
('TH.1110', 'Cốt thép móng đường kính ≤ 10mm', 'tấn', 'cot_thep',
 $$[
   {"name":"Thép tròn ≤ 10mm","unit":"kg","qtyPerUnit":1025},
   {"name":"Dây thép buộc 1mm","unit":"kg","qtyPerUnit":21.42},
   {"name":"Que hàn","unit":"kg","qtyPerUnit":6.05}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":8.34}]$$::jsonb,
 $$[
   {"name":"Máy hàn 23kW","qtyPerUnit":1.30},
   {"name":"Máy cắt uốn cốt thép 5kW","qtyPerUnit":0.40}
 ]$$::jsonb,
 'TT 12/2021 BXD'),

('TH.1120', 'Cốt thép móng đường kính ≤ 18mm', 'tấn', 'cot_thep',
 $$[
   {"name":"Thép tròn ≤ 18mm","unit":"kg","qtyPerUnit":1020},
   {"name":"Dây thép buộc 1mm","unit":"kg","qtyPerUnit":14.28},
   {"name":"Que hàn","unit":"kg","qtyPerUnit":4.62}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":7.20}]$$::jsonb,
 $$[
   {"name":"Máy hàn 23kW","qtyPerUnit":1.05},
   {"name":"Máy cắt uốn cốt thép 5kW","qtyPerUnit":0.32}
 ]$$::jsonb,
 'TT 12/2021 BXD'),

('TH.1210', 'Cốt thép cột đường kính ≤ 10mm', 'tấn', 'cot_thep',
 $$[
   {"name":"Thép tròn ≤ 10mm","unit":"kg","qtyPerUnit":1025},
   {"name":"Dây thép buộc 1mm","unit":"kg","qtyPerUnit":21.42},
   {"name":"Que hàn","unit":"kg","qtyPerUnit":6.05}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":10.50}]$$::jsonb,
 $$[
   {"name":"Máy hàn 23kW","qtyPerUnit":1.30},
   {"name":"Máy cắt uốn cốt thép 5kW","qtyPerUnit":0.40}
 ]$$::jsonb,
 'TT 12/2021 BXD'),

('TH.1220', 'Cốt thép cột đường kính ≤ 18mm', 'tấn', 'cot_thep',
 $$[
   {"name":"Thép tròn ≤ 18mm","unit":"kg","qtyPerUnit":1020},
   {"name":"Dây thép buộc 1mm","unit":"kg","qtyPerUnit":14.28},
   {"name":"Que hàn","unit":"kg","qtyPerUnit":4.62}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":8.20}]$$::jsonb,
 $$[
   {"name":"Máy hàn 23kW","qtyPerUnit":1.05},
   {"name":"Máy cắt uốn cốt thép 5kW","qtyPerUnit":0.32}
 ]$$::jsonb,
 'TT 12/2021 BXD'),

('TH.1320', 'Cốt thép dầm đường kính ≤ 18mm', 'tấn', 'cot_thep',
 $$[
   {"name":"Thép tròn ≤ 18mm","unit":"kg","qtyPerUnit":1020},
   {"name":"Dây thép buộc 1mm","unit":"kg","qtyPerUnit":14.28},
   {"name":"Que hàn","unit":"kg","qtyPerUnit":4.62}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":8.90}]$$::jsonb,
 $$[
   {"name":"Máy hàn 23kW","qtyPerUnit":1.05},
   {"name":"Máy cắt uốn cốt thép 5kW","qtyPerUnit":0.32}
 ]$$::jsonb,
 'TT 12/2021 BXD'),

('TH.1410', 'Cốt thép sàn đường kính ≤ 10mm', 'tấn', 'cot_thep',
 $$[
   {"name":"Thép tròn ≤ 10mm","unit":"kg","qtyPerUnit":1025},
   {"name":"Dây thép buộc 1mm","unit":"kg","qtyPerUnit":21.42},
   {"name":"Que hàn","unit":"kg","qtyPerUnit":6.05}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":11.85}]$$::jsonb,
 $$[
   {"name":"Máy hàn 23kW","qtyPerUnit":1.30},
   {"name":"Máy cắt uốn cốt thép 5kW","qtyPerUnit":0.40}
 ]$$::jsonb,
 'TT 12/2021 BXD'),

-- ─── CỐP PHA ───
('CP.1110', 'Cốp pha móng gỗ ván', 'm²', 'cop_pha',
 $$[
   {"name":"Gỗ ván cốp pha","unit":"m³","qtyPerUnit":0.048},
   {"name":"Đinh các loại","unit":"kg","qtyPerUnit":0.122}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.34}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('CP.1120', 'Cốp pha cột gỗ ván', 'm²', 'cop_pha',
 $$[
   {"name":"Gỗ ván cốp pha","unit":"m³","qtyPerUnit":0.052},
   {"name":"Đinh các loại","unit":"kg","qtyPerUnit":0.157},
   {"name":"Cây chống thép","unit":"cái-ca","qtyPerUnit":0.18}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.42}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('CP.1130', 'Cốp pha dầm-sàn gỗ ván', 'm²', 'cop_pha',
 $$[
   {"name":"Gỗ ván cốp pha","unit":"m³","qtyPerUnit":0.045},
   {"name":"Đinh các loại","unit":"kg","qtyPerUnit":0.148},
   {"name":"Cây chống thép","unit":"cái-ca","qtyPerUnit":0.32}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.39}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('CP.1140', 'Cốp pha cầu thang gỗ ván', 'm²', 'cop_pha',
 $$[
   {"name":"Gỗ ván cốp pha","unit":"m³","qtyPerUnit":0.058},
   {"name":"Đinh các loại","unit":"kg","qtyPerUnit":0.182},
   {"name":"Cây chống thép","unit":"cái-ca","qtyPerUnit":0.28}
 ]$$::jsonb,
 $$[{"grade":"4.0","qtyPerUnit":0.55}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

-- ─── XÂY ───
('XY.1110', 'Xây tường gạch ống 80x80x180 dày 100 vữa M75', 'm³', 'xay',
 $$[
   {"name":"Gạch ống 80x80x180","unit":"viên","qtyPerUnit":643},
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":71.85},
   {"name":"Cát đen xây","unit":"m³","qtyPerUnit":0.232}
 ]$$::jsonb,
 $$[{"grade":"3.0","qtyPerUnit":1.59}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('XY.1120', 'Xây tường gạch ống 80x80x180 dày 200 vữa M75', 'm³', 'xay',
 $$[
   {"name":"Gạch ống 80x80x180","unit":"viên","qtyPerUnit":552},
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":46.62},
   {"name":"Cát đen xây","unit":"m³","qtyPerUnit":0.151}
 ]$$::jsonb,
 $$[{"grade":"3.0","qtyPerUnit":1.24}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('XY.1130', 'Xây tường gạch đinh 45x95x190 dày 100 vữa M75', 'm³', 'xay',
 $$[
   {"name":"Gạch đinh 45x95x190","unit":"viên","qtyPerUnit":643},
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":68.50},
   {"name":"Cát đen xây","unit":"m³","qtyPerUnit":0.221}
 ]$$::jsonb,
 $$[{"grade":"3.0","qtyPerUnit":1.45}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

-- ─── TÔ TRÁT ───
('TR.1110', 'Trát tường trong dày 1.5cm vữa M75', 'm²', 'to_trat',
 $$[
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":4.97},
   {"name":"Cát mịn","unit":"m³","qtyPerUnit":0.020},
   {"name":"Nước","unit":"lít","qtyPerUnit":7.9}
 ]$$::jsonb,
 $$[{"grade":"3.0","qtyPerUnit":0.170}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('TR.1120', 'Trát tường ngoài dày 1.5cm vữa M75', 'm²', 'to_trat',
 $$[
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":4.97},
   {"name":"Cát mịn","unit":"m³","qtyPerUnit":0.020},
   {"name":"Nước","unit":"lít","qtyPerUnit":7.9}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.207}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('TR.1130', 'Trát trần dày 1.5cm vữa M75', 'm²', 'to_trat',
 $$[
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":4.97},
   {"name":"Cát mịn","unit":"m³","qtyPerUnit":0.020},
   {"name":"Nước","unit":"lít","qtyPerUnit":7.9}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.247}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('TR.1140', 'Trát cột dày 1.5cm vữa M75', 'm²', 'to_trat',
 $$[
   {"name":"Xi măng PCB30","unit":"kg","qtyPerUnit":4.97},
   {"name":"Cát mịn","unit":"m³","qtyPerUnit":0.020},
   {"name":"Nước","unit":"lít","qtyPerUnit":7.9}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.189}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

-- ─── ỐP LÁT ───
('OL.1110', 'Lát nền gạch ceramic 500x500 vữa khô', 'm²', 'op_lat',
 $$[
   {"name":"Gạch ceramic 500x500","unit":"m²","qtyPerUnit":1.02},
   {"name":"Vữa lót XM M75","unit":"m³","qtyPerUnit":0.024},
   {"name":"Keo dán gạch","unit":"kg","qtyPerUnit":1.2},
   {"name":"Bột chít mạch","unit":"kg","qtyPerUnit":0.15}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.200}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('OL.1120', 'Lát nền gạch ceramic 600x600 vữa khô', 'm²', 'op_lat',
 $$[
   {"name":"Gạch ceramic 600x600","unit":"m²","qtyPerUnit":1.02},
   {"name":"Vữa lót XM M75","unit":"m³","qtyPerUnit":0.024},
   {"name":"Keo dán gạch","unit":"kg","qtyPerUnit":1.2},
   {"name":"Bột chít mạch","unit":"kg","qtyPerUnit":0.15}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.184}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('OL.1130', 'Lát sàn WC gạch chống trượt 300x300', 'm²', 'op_lat',
 $$[
   {"name":"Gạch nhám 300x300","unit":"m²","qtyPerUnit":1.05},
   {"name":"Vữa lót XM M75","unit":"m³","qtyPerUnit":0.022},
   {"name":"Keo dán gạch","unit":"kg","qtyPerUnit":1.5},
   {"name":"Bột chít mạch","unit":"kg","qtyPerUnit":0.22}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.235}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('OL.1210', 'Ốp tường gạch ceramic 300x600', 'm²', 'op_lat',
 $$[
   {"name":"Gạch ceramic 300x600","unit":"m²","qtyPerUnit":1.05},
   {"name":"Keo dán gạch","unit":"kg","qtyPerUnit":4.5},
   {"name":"Bột chít mạch","unit":"kg","qtyPerUnit":0.18}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.245}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('OL.1220', 'Ốp tường WC gạch 250x400', 'm²', 'op_lat',
 $$[
   {"name":"Gạch ceramic 250x400","unit":"m²","qtyPerUnit":1.05},
   {"name":"Keo dán gạch","unit":"kg","qtyPerUnit":4.5},
   {"name":"Bột chít mạch","unit":"kg","qtyPerUnit":0.20}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.270}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('OL.1310', 'Ốp đá granite mặt tiền dày 18mm', 'm²', 'op_lat',
 $$[
   {"name":"Đá granite tự nhiên 18mm","unit":"m²","qtyPerUnit":1.02},
   {"name":"Keo dán đá tự nhiên","unit":"kg","qtyPerUnit":3.0},
   {"name":"Vít neo inox","unit":"cái","qtyPerUnit":4}
 ]$$::jsonb,
 $$[{"grade":"4.0","qtyPerUnit":0.320}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

-- ─── SƠN ───
('SN.1110', 'Sơn nội thất 1 lớp lót + 2 lớp phủ', 'm²', 'son',
 $$[
   {"name":"Sơn lót nội thất","unit":"lít","qtyPerUnit":0.0875},
   {"name":"Sơn phủ nội thất","unit":"lít","qtyPerUnit":0.175}
 ]$$::jsonb,
 $$[{"grade":"3.0","qtyPerUnit":0.060}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('SN.1120', 'Sơn ngoại thất 1 lớp lót + 2 lớp phủ', 'm²', 'son',
 $$[
   {"name":"Sơn lót ngoại thất","unit":"lít","qtyPerUnit":0.0875},
   {"name":"Sơn phủ ngoại thất","unit":"lít","qtyPerUnit":0.175}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.082}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('SN.1130', 'Bả matit tường cho sơn (2 lớp)', 'm²', 'son',
 $$[{"name":"Bột bả matit","unit":"kg","qtyPerUnit":0.45}]$$::jsonb,
 $$[{"grade":"3.0","qtyPerUnit":0.072}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

-- ─── TRẦN THẠCH CAO ───
('TC.1110', 'Trần thạch cao chìm khung xương V', 'm²', 'tran',
 $$[
   {"name":"Tấm thạch cao 9mm","unit":"m²","qtyPerUnit":1.02},
   {"name":"Khung xương V","unit":"md","qtyPerUnit":1.05},
   {"name":"Vít tự khoan","unit":"cái","qtyPerUnit":13},
   {"name":"Ty treo + nở thép","unit":"bộ","qtyPerUnit":3}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.180}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('TC.1120', 'Trần thạch cao nổi thả khung 600x600', 'm²', 'tran',
 $$[
   {"name":"Tấm thả 600x600","unit":"tấm","qtyPerUnit":2.82},
   {"name":"Khung xương nổi","unit":"md","qtyPerUnit":1.5},
   {"name":"Ty treo + nở thép","unit":"bộ","qtyPerUnit":2}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.120}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

-- ─── CHỐNG THẤM ───
('TM.1110', 'Chống thấm sàn WC 2 lớp Sika Topseal-107', 'm²', 'chong_tham',
 $$[
   {"name":"Sika Topseal-107","unit":"kg","qtyPerUnit":1.80},
   {"name":"Lưới sợi thủy tinh","unit":"m²","qtyPerUnit":1.10}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.160}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('TM.1120', 'Chống thấm sàn mái 2 lớp Sika', 'm²', 'chong_tham',
 $$[
   {"name":"Sika Topseal-107","unit":"kg","qtyPerUnit":2.00},
   {"name":"Lưới sợi thủy tinh","unit":"m²","qtyPerUnit":1.15}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.190}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('TM.1130', 'Chống thấm sê nô + máng nước Sika', 'm²', 'chong_tham',
 $$[
   {"name":"Sika Topseal-107","unit":"kg","qtyPerUnit":2.50},
   {"name":"Lưới sợi thủy tinh","unit":"m²","qtyPerUnit":1.20}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.250}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

-- ─── CỬA ───
('CU.1110', 'Lắp cửa gỗ công nghiệp + bao + khoá', 'm²', 'cua',
 $$[
   {"name":"Cánh cửa gỗ CN","unit":"m²","qtyPerUnit":1.00},
   {"name":"Bao cửa gỗ","unit":"md","qtyPerUnit":2.20},
   {"name":"Khoá cửa","unit":"bộ","qtyPerUnit":0.45},
   {"name":"Bản lề","unit":"bộ","qtyPerUnit":1.35}
 ]$$::jsonb,
 $$[{"grade":"4.0","qtyPerUnit":0.850}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('CU.1120', 'Lắp cửa nhôm kính 1 cánh', 'm²', 'cua',
 $$[
   {"name":"Khung nhôm cửa","unit":"md","qtyPerUnit":4.20},
   {"name":"Kính cường lực 8mm","unit":"m²","qtyPerUnit":0.95},
   {"name":"Phụ kiện nhôm kính","unit":"bộ","qtyPerUnit":1.00}
 ]$$::jsonb,
 $$[{"grade":"4.0","qtyPerUnit":0.650}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('CU.1210', 'Lắp lan can sắt sơn dầu', 'md', 'cua',
 $$[
   {"name":"Sắt hộp 25x25","unit":"kg","qtyPerUnit":3.2},
   {"name":"Sắt hộp 14x14","unit":"kg","qtyPerUnit":2.8},
   {"name":"Sơn dầu","unit":"lít","qtyPerUnit":0.15},
   {"name":"Que hàn","unit":"kg","qtyPerUnit":0.18}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.480}]$$::jsonb,
 $$[{"name":"Máy hàn 23kW","qtyPerUnit":0.082}]$$::jsonb,
 'TT 12/2021 BXD'),

-- ─── MEP ───
('ME.1110', 'Đi dây điện trong ống PVC âm tường', 'md', 'mep',
 $$[
   {"name":"Ống PVC ⌀20","unit":"md","qtyPerUnit":1.05},
   {"name":"Dây điện 2.5mm²","unit":"md","qtyPerUnit":1.10}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.110}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD'),

('ME.1210', 'Đi ống nước PPR ⌀25 âm sàn', 'md', 'mep',
 $$[
   {"name":"Ống PPR ⌀25","unit":"md","qtyPerUnit":1.05},
   {"name":"Phụ kiện hàn nhiệt","unit":"cái","qtyPerUnit":0.25}
 ]$$::jsonb,
 $$[{"grade":"3.5","qtyPerUnit":0.120}]$$::jsonb,
 $$[]$$::jsonb,
 'TT 12/2021 BXD');
