-- Admin yêu cầu AI sửa lại 1 công tác: text yêu cầu lưu tại đây, worker đọc → sửa → clear.
ALTER TABLE "estimate_lines" ADD COLUMN "fix_request" TEXT;
