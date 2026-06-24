-- Thêm 3 kind notif cho luồng lệnh chi M8 (admin <-> kế toán)
-- ADD VALUE phải nằm ngoài transaction → tách từng câu

ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'expense_new';
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'expense_paid';
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'expense_cancelled';
