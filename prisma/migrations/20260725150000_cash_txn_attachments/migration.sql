-- Ảnh bổ sung gắn thẳng vào phiếu trong sổ quỹ (kế toán bổ sung chứng từ sau).
-- Trước đây ảnh chỉ suy từ expense/receipt liên kết; phiếu không gắn nguồn (khai
-- tay, chuyển quỹ, số dư đầu) không đính được ảnh. Cột này cho phép gắn trực tiếp.
ALTER TABLE "cash_transactions"
  ADD COLUMN "attachment_urls" TEXT[] NOT NULL DEFAULT '{}';
