-- Danh sách mua hàng GHI TAY theo hạng mục (PHẦN) — AI soạn từ bóc tách dự toán + hao hụt.
-- Màn /projects/[id]/mua-hang chỉ đọc cột này (không tự gộp từ dự toán nữa).
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "mua_hang_list" JSONB;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "mua_hang_list_updated_at" TIMESTAMP(3);
