// GĐ 4 Thiết kế: 3 bước — ① mặt bằng, ② 3D phối cảnh, ③ bộ bản vẽ thi công 3 bộ môn.
// File: project_documents.design_step (3D: design_photo_groups.design_step = phoi_canh); lệnh chi thuê ngoài gắn sourceType = "thiet_ke_<step>".
export const DESIGN_STEPS = [
  { key: "mat_bang", label: "Mặt bằng", group: 1 },
  { key: "phoi_canh", label: "3D phối cảnh", group: 2 },
  { key: "kien_truc", label: "Kiến trúc", group: 3 },
  { key: "ket_cau", label: "Kết cấu", group: 3 },
  { key: "dien_nuoc", label: "Điện nước", group: 3 },
] as const;

export type DesignStepKey = (typeof DESIGN_STEPS)[number]["key"];

export const DESIGN_GROUPS = [
  { group: 1, title: "① Mặt bằng" },
  { group: 2, title: "② 3D phối cảnh" },
  { group: 3, title: "③ Bộ bản vẽ thi công" },
] as const;

export function isDesignStep(v: unknown): v is DesignStepKey {
  return DESIGN_STEPS.some((s) => s.key === v);
}

export function designStepLabel(key: string | null | undefined) {
  return DESIGN_STEPS.find((s) => s.key === key)?.label ?? "";
}

export const DESIGN_EXPENSE_SOURCES = DESIGN_STEPS.map(
  (s) => `thiet_ke_${s.key}` as const,
);
