-- Form mẫu chuẩn cho hạng mục dự toán: templateKey + formData (câu trả lời form)
ALTER TABLE "estimate_items" ADD COLUMN "template_key" VARCHAR(32);
ALTER TABLE "estimate_items" ADD COLUMN "form_data" JSONB NOT NULL DEFAULT '{}';
