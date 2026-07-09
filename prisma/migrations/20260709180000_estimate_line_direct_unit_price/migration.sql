-- Giá trọn gói nhập thẳng trên line (cửa nhôm/nhựa… ngoài định mức, không map NCC)
-- Thành tiền VT = quantity × direct_unit_price
ALTER TABLE "estimate_lines" ADD COLUMN "direct_unit_price" BIGINT;
