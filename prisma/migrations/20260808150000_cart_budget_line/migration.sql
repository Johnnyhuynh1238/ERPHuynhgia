-- Giỏ mua hàng gắn hạng mục ngân sách (bắt buộc chọn khi thêm giỏ).
ALTER TABLE "mh_cart_items" ADD COLUMN "budget_line_id" UUID;
