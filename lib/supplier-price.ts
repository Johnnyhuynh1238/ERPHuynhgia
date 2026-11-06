// SOP-26 mục 3.8 — bảng giá NCC đã duyệt.
// Đổi giá ≤ 3% → Trưởng phòng Mua hàng · 3–10% → CEO · > 10%, lần đầu, hoặc đổi NCC chính → sếp.
// Hiệu lực 30 ngày kể từ lúc duyệt; hết hạn thì nhập lại giá để duyệt lại.

export type PriceLevel = "truong_mh" | "ceo" | "sep";
export type SupplierRank = "chinh" | "du_phong";

export const PRICE_VALID_DAYS = 30;

export const LEVEL_LABEL: Record<PriceLevel, string> = {
  truong_mh: "Chờ TP Mua hàng duyệt",
  ceo: "Chờ CEO duyệt",
  sep: "Chờ sếp duyệt",
};

export const RANK_LABEL: Record<SupplierRank, string> = {
  chinh: "NCC chính",
  du_phong: "NCC dự phòng",
};

const LEVEL_ORDER: PriceLevel[] = ["truong_mh", "ceo", "sep"];

export function pctChange(oldPrice: number | null, newPrice: number): number | null {
  if (oldPrice === null || !(oldPrice > 0)) return null;
  return Math.round(((newPrice - oldPrice) / oldPrice) * 10000) / 100;
}

// approvedPrice = null khi giá chưa từng được duyệt (lần đầu → sếp).
export function priceLevel(
  approvedPrice: number | null,
  newPrice: number,
  becomesMainSupplier: boolean,
): PriceLevel {
  const pct = pctChange(approvedPrice, newPrice);
  let lv: PriceLevel = pct === null ? "sep" : Math.abs(pct) <= 3 ? "truong_mh" : Math.abs(pct) <= 10 ? "ceo" : "sep";
  if (becomesMainSupplier) lv = "sep";
  return lv;
}

export function maxLevel(a: PriceLevel, b: PriceLevel): PriceLevel {
  return LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b;
}

export function validUntilFrom(d: Date): Date {
  const out = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  out.setUTCDate(out.getUTCDate() + PRICE_VALID_DAYS);
  return out;
}

export function isExpired(validUntil: Date | string | null): boolean {
  if (!validUntil) return true;
  const v = typeof validUntil === "string" ? new Date(validUntil) : validUntil;
  const today = new Date();
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return v.getTime() < t;
}
