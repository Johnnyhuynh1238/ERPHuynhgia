// GĐ 5 Chuẩn bị: checklist trước khi thi công — chốt đủ mới sang GĐ 6 Thi công.
// Mỗi mục mở màn có sẵn của dự án; ngày chốt lưu project_pipelines.prep_done {mục: ISO}.
export const PREP_STEPS = [
  { key: "du_toan", label: "Dự toán", group: 1, path: "du-toan" },
  { key: "ngan_sach", label: "Ngân sách", group: 1, path: "budget-plan" },
  { key: "hd_mua_hang", label: "HD mua hàng", group: 2, path: "huong-dan-mua-hang" },
  { key: "hd_giam_sat", label: "HD giám sát", group: 2, path: "hd-thi-cong" },
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
