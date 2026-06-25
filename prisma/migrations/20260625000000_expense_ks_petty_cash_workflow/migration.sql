-- KS-QL "Yêu cầu chi mua lẻ" workflow:
-- KS tạo Expense ở tptc_pending → TPTC duyệt → pending (KT thấy như lệnh chi thường) → KT chi → paid.

ALTER TYPE "ExpenseStatus" ADD VALUE IF NOT EXISTS 'tptc_pending' BEFORE 'pending';

ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'expense_ks_request';
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'expense_tptc_approved';
ALTER TYPE "StaffNotificationKind" ADD VALUE IF NOT EXISTS 'expense_tptc_rejected';

ALTER TABLE "expenses"
  ADD COLUMN "tptc_approved_by"     UUID,
  ADD COLUMN "tptc_approved_at"     TIMESTAMP(3),
  ADD COLUMN "tptc_rejected_reason" TEXT;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_tptc_approved_by_fkey"
  FOREIGN KEY ("tptc_approved_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- Danh mục mặc định cho yêu cầu KS mua lẻ tại công trình
INSERT INTO "expense_categories" (id, code, name, sort_order, active, created_at, updated_at)
VALUES (gen_random_uuid(), 'MUA-LE', 'Hàng mua lẻ công trình', 100, true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;
