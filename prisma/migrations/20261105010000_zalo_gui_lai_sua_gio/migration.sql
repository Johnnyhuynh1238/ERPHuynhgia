-- Sửa giờ hàng chờ gửi lại Zalo (việc V261105-072824, V261105-074036): bản 20261104220000_zalo_gui_lai đưa BB chủ nhà
-- chờ ký vào hàng bằng CURRENT_TIMESTAMP → DB chạy giờ VN nên next_at lưu 07:24 giờ VN, trong khi ERP đọc cột TIMESTAMP
-- là giờ UTC → máy quét hiểu thành 14:24 VN, trễ 7 tiếng.
-- CHỈ dời next_at về ngay lúc bản này lên (giờ UTC, như now() at time zone 'UTC' ở 20261007230000_design_step_documents)
-- cho đúng 2 dòng BB Móng, BB Giằng móng DA-2026-006 chưa gửi lần nào. Không đổi nội dung tin, số lần, cột khác.
-- Ghi giờ trong SQL về sau: dùng (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), không dùng CURRENT_TIMESTAMP trơn.
UPDATE "zalo_retries"
SET "next_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
WHERE "id" IN ('745352ec-8957-46bf-a380-06262d1411d8', '9b8622ee-710e-474f-88e7-27b3b4008100')
  AND "status" = 'pending'
  AND "tries" = 1
  AND "sent_at" IS NULL;
