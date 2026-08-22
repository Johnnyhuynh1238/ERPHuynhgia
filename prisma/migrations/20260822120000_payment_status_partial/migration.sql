-- Thêm trạng thái "thu 1 phần" cho đợt thanh toán (cộng dồn phiếu thu)
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'partial';
