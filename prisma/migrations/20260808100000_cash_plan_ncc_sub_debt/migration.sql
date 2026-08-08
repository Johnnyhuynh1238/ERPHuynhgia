-- Thêm nguồn công nợ NCC vật tư + nợ thầu phụ vào kế hoạch thu-chi.
ALTER TYPE "CashPlanSourceType" ADD VALUE IF NOT EXISTS 'ncc_congno';
ALTER TYPE "CashPlanSourceType" ADD VALUE IF NOT EXISTS 'sub_debt';
