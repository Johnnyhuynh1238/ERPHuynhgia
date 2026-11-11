-- Sếp 11/11/2026: NCC vật liệu thô (VLXD) trả công nợ vào ngày 15 và 30 hằng tháng
-- (hàng giao → trả ngày 15 / 30 gần nhất kể từ ngày giao; tháng thiếu ngày 30 → ngày cuối tháng).
ALTER TYPE "CashTerm" ADD VALUE IF NOT EXISTS 'ky_15_30';
