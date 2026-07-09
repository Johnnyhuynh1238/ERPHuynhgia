-- Admin trả lời câu hỏi của từng công tác ngay tại tab Khối lượng (câu hỏi công tác nằm dưới công tác đó).
ALTER TABLE "estimate_lines" ADD COLUMN "ai_answer" TEXT;
