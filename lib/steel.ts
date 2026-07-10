// Cốt thép: bóc theo cây/Ø để đi mua, quy ra tấn để khớp định mức (NC + máy + phụ liệu).
// Thép chính KHÔNG đi qua vật tư định mức (định mức gộp mọi Ø thành 1 tên kg, mất số cây);
// thay vào đó xuất riêng theo cây/kg từng Ø để mua, giá NCC theo cây.

// Trọng lượng lý thuyết (kg/m) theo đường kính.
export const STEEL_KG_PER_M: Record<number, number> = {
  6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 14: 1.208,
  16: 1.578, 18: 2.0, 20: 2.466, 22: 2.984, 25: 3.853,
};
export const STEEL_DIAS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25] as const;
export const STEEL_DEFAULT_BAR_LEN = 11.7; // chiều dài 1 cây thép (m)

export type SteelCauKien = "mong" | "cot" | "dam" | "san";
export const STEEL_CAU_KIEN: SteelCauKien[] = ["mong", "cot", "dam", "san"];
export const STEEL_CAU_KIEN_LABELS: Record<SteelCauKien, string> = {
  mong: "Móng", cot: "Cột", dam: "Dầm", san: "Sàn",
};

// Auto-map cấu kiện × dải Ø → mã định mức tấn (chỉ dùng NC + máy + dây/que hàn).
// Catalog chỉ có mấy mã này; dầm chỉ có ≤18, sàn chỉ có ≤10 → dùng chung cho cả 2 dải.
const STEEL_NORM: Record<SteelCauKien, { le10: string; ge12: string }> = {
  mong: { le10: "TH.1110", ge12: "TH.1120" },
  cot: { le10: "TH.1210", ge12: "TH.1220" },
  dam: { le10: "TH.1320", ge12: "TH.1320" },
  san: { le10: "TH.1410", ge12: "TH.1410" },
};

export function steelNormCode(cauKien: SteelCauKien, dia: number): string {
  const m = STEEL_NORM[cauKien] ?? STEEL_NORM.mong;
  return dia <= 10 ? m.le10 : m.ge12;
}

// Ø≥10 bóc & mua theo cây; Ø<10 (6, 8) bóc & mua theo kg.
export function steelIsBar(dia: number): boolean {
  return dia >= 10;
}
export function steelUnit(dia: number): string {
  return steelIsBar(dia) ? "cây" : "kg";
}

// Hệ số hao hụt thép mua = số lượng bóc × hệ số (khớp định mức: ≤10 → 1.025, ≥12 → 1.02).
export function steelWaste(dia: number): number {
  return dia <= 10 ? 1.025 : 1.02;
}

// Quy đổi khối lượng bóc (cây với Ø≥10, kg với Ø<10) → tấn để khớp định mức.
export function steelTonnage(dia: number, qty: number, barLen: number): number {
  if (!steelIsBar(dia)) return qty / 1000; // qty = kg
  const kgm = STEEL_KG_PER_M[dia] ?? 0;
  const len = barLen > 0 ? barLen : STEEL_DEFAULT_BAR_LEN;
  return (qty * len * kgm) / 1000; // qty = cây
}

// Đoán cấu kiện từ tên công tác (admin đổi lại được trong popup).
export function detectCauKien(name: string): SteelCauKien {
  const s = name.toLowerCase();
  if (s.includes("sàn") || s.includes("đan")) return "san";
  if (s.includes("dầm") || s.includes("giằng")) return "dam";
  if (s.includes("cột")) return "cot";
  if (s.includes("móng") || s.includes("đài")) return "mong";
  return "mong";
}
