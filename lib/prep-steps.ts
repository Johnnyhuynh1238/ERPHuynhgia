// GĐ 5 Chuẩn bị: checklist trước khi thi công — chốt đủ mới sang GĐ 6 Thi công.
// Mỗi mục mở màn có sẵn của dự án; ngày chốt lưu project_pipelines.prep_done {mục: ISO}.
// SOP-22 v8: đủ 8 mục (Mục 6 Tiến độ chi tiết = tien_do, GĐ-4; Mục 8 Kế hoạch dòng tiền = dong_tien, GĐ-24).
export const PREP_STEPS = [
  { key: "du_toan", label: "Dự toán", group: 1, path: "du-toan" },
  { key: "ngan_sach", label: "Ngân sách", group: 1, path: "budget-plan" },
  { key: "dong_tien", label: "Kế hoạch dòng tiền", group: 1, path: "dong-tien" },
  { key: "hd_mua_hang", label: "HD mua hàng", group: 2, path: "huong-dan-mua-hang" },
  { key: "hd_giam_sat", label: "HD giám sát", group: 2, path: "hd-thi-cong" },
  { key: "tien_do", label: "Tiến độ chi tiết + Gán mốc", group: 2, path: "tien-do" },
  { key: "thau_phu", label: "Hợp đồng thầu phụ", group: 3, path: "sub-contracts" },
  { key: "nhan_su", label: "Giao KS / quản lý", group: 4, path: "edit" },
] as const;

export type PrepStepKey = (typeof PREP_STEPS)[number]["key"];

export const PREP_GROUPS = [
  { group: 1, title: "① Tài chính dự án" },
  { group: 2, title: "② Hướng dẫn nội bộ" },
  { group: 3, title: "③ Hợp đồng thầu phụ" },
  { group: 4, title: "④ Nhân sự" },
] as const;

export function prepMissing(done: Record<string, string> | null | undefined) {
  return PREP_STEPS.filter((s) => !done?.[s.key]);
}
