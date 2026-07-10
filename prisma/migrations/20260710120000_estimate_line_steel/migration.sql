-- Cốt thép bóc theo cây/Ø: quy tấn khớp định mức (NC + máy + phụ), thép chính mua riêng theo cây.
ALTER TABLE "estimate_lines"
  ADD COLUMN "steel_dia" INTEGER,
  ADD COLUMN "steel_bar_len" DECIMAL(6,2),
  ADD COLUMN "steel_price_id" UUID;

ALTER TABLE "estimate_lines"
  ADD CONSTRAINT "estimate_lines_steel_price_id_fkey"
  FOREIGN KEY ("steel_price_id") REFERENCES "material_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "estimate_lines_steel_price_id_idx" ON "estimate_lines"("steel_price_id");
