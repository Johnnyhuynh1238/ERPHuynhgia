// Bộ form mẫu chuẩn cho hạng mục dự toán — dùng chung mọi dự án.
// Mỗi mẫu chia 3 section đúng 3 cột nhập (biện pháp / vật tư / kích thước);
// lưu form xong renderFormText() sinh text vào 3 cột để AI worker đọc như mô tả tự do.

export type EstimateFormField =
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "number"; unit?: string; placeholder?: string }
  | { key: string; label: string; type: "text"; unit?: string; placeholder?: string }
  | { key: string; label: string; type: "textarea"; placeholder?: string }
  | { key: string; label: string; type: "heading" }; // tiêu đề cụm nhỏ trong section

export type EstimateFormSection = {
  col: "method" | "materialSpec" | "dimensions";
  title: string;
  fields: EstimateFormField[];
};

export type EstimateTemplate = {
  key: string;
  name: string;
  sections: EstimateFormSection[];
};

const THEP = ["Thép Việt Nhật", "Thép Hòa Phát"];
const XI_MANG = ["Xi măng Hà Tiên 1", "Xi măng Insee", "Xi măng StarMax"];
const GACH = ["Gạch ống 8×18", "Gạch tuynel Trà Giang", "Gạch tuynel Mỹ Xuân"];
const BE_TONG = ["Thương phẩm", "Trộn tại chỗ"];
const DO_BANG = ["Bơm", "Thủ công"];

export const ESTIMATE_TEMPLATES: EstimateTemplate[] = [
  {
    key: "mong_nen",
    name: "Móng + nền trệt",
    sections: [
      {
        col: "method",
        title: "Biện pháp thi công",
        fields: [
          { key: "loai_mong", label: "Loại móng", type: "select", options: ["Móng đơn", "Móng băng", "Móng bè", "Móng cọc + đài"] },
          { key: "dao_dat", label: "Đào đất", type: "select", options: ["Máy + sửa thủ công", "Máy", "Thủ công"] },
          { key: "lot_mong", label: "Lót móng", type: "select", options: ["Đá 4x6 + vữa trải", "BT lót đá 4x6", "BT lót đá 1x2"] },
          { key: "be_tong", label: "Bê tông", type: "select", options: BE_TONG },
          { key: "do_bang", label: "Đổ bằng", type: "select", options: DO_BANG },
          { key: "dap_nen", label: "Đắp nền", type: "select", options: ["Đất san lấp", "Cát san lấp", "Không đắp"] },
        ],
      },
      {
        col: "materialSpec",
        title: "Chủng loại vật tư",
        fields: [
          { key: "thep", label: "Thép", type: "select", options: THEP },
          { key: "xi_mang", label: "Xi măng", type: "select", options: XI_MANG },
          { key: "mac_bt_mong", label: "Mác BT móng", type: "number", unit: "M", placeholder: "250" },
          { key: "mac_bt_nen", label: "Mác BT nền", type: "number", unit: "M", placeholder: "250" },
          { key: "gach_tuong_bo", label: "Gạch tường bo", type: "select", options: [...GACH, "Đá chẻ", "Không xây"] },
        ],
      },
      {
        col: "dimensions",
        title: "Kích thước",
        fields: [
          { key: "h_mong", label: "Móng", type: "heading" },
          { key: "so_mong", label: "Số móng", type: "number", unit: "móng" },
          { key: "day_mong", label: "Đáy móng D×R", type: "text", unit: "m", placeholder: "1.2×1.2" },
          { key: "cao_mong", label: "Cao móng", type: "number", unit: "cm", placeholder: "20" },
          { key: "vat_canh", label: "Vát cạnh", type: "number", unit: "cm", placeholder: "15" },
          { key: "sau_dao", label: "Sâu đào", type: "number", unit: "m" },
          { key: "vi_thep_mong", label: "Vỉ thép móng", type: "text", placeholder: "D10 a150" },
          { key: "h_co_cot", label: "Cổ cột", type: "heading" },
          { key: "co_cot_td", label: "Tiết diện", type: "text", unit: "cm", placeholder: "20×20" },
          { key: "co_cot_thep", label: "Thép dọc", type: "text", placeholder: "4D14" },
          { key: "co_cot_dai", label: "Đai", type: "text", placeholder: "D6 a150" },
          { key: "co_cot_cao", label: "Cao cổ cột", type: "number", unit: "m" },
          { key: "h_tuong_bo", label: "Tường bo móng", type: "heading" },
          { key: "tuong_bo_day", label: "Dày", type: "select", options: ["100", "200"] },
          { key: "tuong_bo_cao", label: "Cao", type: "number", unit: "m" },
          { key: "h_da_kieng", label: "Đà kiềng", type: "heading" },
          { key: "dk_td", label: "Tiết diện", type: "text", unit: "cm", placeholder: "20×30" },
          { key: "dk_dai_tong", label: "Tổng dài", type: "number", unit: "m" },
          { key: "dk_thep", label: "Thép dọc", type: "text", placeholder: "4D16" },
          { key: "dk_dai_thep", label: "Đai", type: "text", placeholder: "D6 a150" },
          { key: "h_nen", label: "Nền trệt", type: "heading" },
          { key: "nen_dt", label: "Diện tích", type: "number", unit: "m²" },
          { key: "nen_bt_day", label: "BT nền dày", type: "number", unit: "cm", placeholder: "10" },
          { key: "nen_vi_thep", label: "Vỉ thép nền", type: "text", placeholder: "D10 a200 / không" },
          { key: "nen_dap_day", label: "Đắp nền dày", type: "number", unit: "m" },
          { key: "ghi_chu", label: "Ghi chú thêm", type: "textarea", placeholder: "Cao độ, giá đất san lấp, giá BT thương phẩm…" },
        ],
      },
    ],
  },
  {
    key: "cot_tuong",
    name: "Cột + tường bao",
    sections: [
      {
        col: "method",
        title: "Biện pháp thi công",
        fields: [
          { key: "be_tong", label: "Bê tông cột", type: "select", options: BE_TONG },
          { key: "do_bang", label: "Đổ bằng", type: "select", options: DO_BANG },
          { key: "vua_xay_mac", label: "Vữa xây mác", type: "number", unit: "M", placeholder: "75" },
          { key: "lanh_to", label: "Lanh tô + ô văng", type: "select", options: ["Đổ tại chỗ", "Đúc sẵn", "Không có"] },
        ],
      },
      {
        col: "materialSpec",
        title: "Chủng loại vật tư",
        fields: [
          { key: "thep", label: "Thép", type: "select", options: THEP },
          { key: "xi_mang", label: "Xi măng", type: "select", options: XI_MANG },
          { key: "gach", label: "Gạch xây", type: "select", options: GACH },
          { key: "cat_xay", label: "Cát xây", type: "select", options: ["Cát xây tô", "Cát hồng pha"] },
          { key: "mac_bt", label: "Mác BT cột", type: "number", unit: "M", placeholder: "250" },
        ],
      },
      {
        col: "dimensions",
        title: "Kích thước",
        fields: [
          { key: "h_cot", label: "Cột", type: "heading" },
          { key: "cot_so", label: "Số cây", type: "number", unit: "cây" },
          { key: "cot_td", label: "Tiết diện", type: "text", unit: "cm", placeholder: "20×20" },
          { key: "cot_cao", label: "Cao (đà kiềng → đáy dầm)", type: "number", unit: "m" },
          { key: "cot_thep", label: "Thép dọc", type: "text", placeholder: "4D14" },
          { key: "cot_dai", label: "Đai", type: "text", placeholder: "D6 a150" },
          { key: "h_tuong", label: "Tường bao", type: "heading" },
          { key: "tuong_day", label: "Dày", type: "select", options: ["100", "200"] },
          { key: "tuong_cao", label: "Cao", type: "number", unit: "m" },
          { key: "tuong_dai", label: "Tổng dài các trục", type: "number", unit: "m" },
          { key: "h_cua", label: "Cửa & lanh tô", type: "heading" },
          { key: "cua_chua_lo", label: "Cửa chừa lỗ (loại + KT + SL)", type: "textarea", placeholder: "Cửa đi 0.9×2.2 ×2; cửa sổ 1.2×1.4 ×4…" },
          { key: "lanh_to_ct", label: "Lanh tô chi tiết", type: "text", placeholder: "dài × cao × dày từng vị trí" },
          { key: "ghi_chu", label: "Ghi chú thêm", type: "textarea" },
        ],
      },
    ],
  },
  {
    key: "dam_mai",
    name: "Dầm + mái",
    sections: [
      {
        col: "method",
        title: "Biện pháp thi công",
        fields: [
          { key: "be_tong", label: "Bê tông dầm", type: "select", options: BE_TONG },
          { key: "do_bang", label: "Đổ bằng", type: "select", options: DO_BANG },
          { key: "mai_loai", label: "Kết cấu mái", type: "select", options: ["Tôn + xà gồ sắt", "Ngói + kèo thép", "Sàn BTCT + chống thấm"] },
          { key: "se_no", label: "Sê nô / máng nước", type: "select", options: ["BTCT đổ liền", "Tôn", "Không có"] },
        ],
      },
      {
        col: "materialSpec",
        title: "Chủng loại vật tư",
        fields: [
          { key: "thep", label: "Thép", type: "select", options: THEP },
          { key: "xi_mang", label: "Xi măng", type: "select", options: XI_MANG },
          { key: "mac_bt", label: "Mác BT dầm", type: "number", unit: "M", placeholder: "250" },
          { key: "ton_ngoi", label: "Tôn / ngói", type: "text", placeholder: "Tôn lạnh màu 0.45mm" },
          { key: "xa_go", label: "Xà gồ / kèo", type: "text", placeholder: "Hộp 5×10 dày 1.8" },
          { key: "chong_tham", label: "Chống thấm", type: "text", placeholder: "Sika / màng khò / không" },
        ],
      },
      {
        col: "dimensions",
        title: "Kích thước",
        fields: [
          { key: "h_dam", label: "Dầm", type: "heading" },
          { key: "dam_td", label: "Tiết diện", type: "text", unit: "cm", placeholder: "20×30" },
          { key: "dam_dai", label: "Tổng dài", type: "number", unit: "m" },
          { key: "dam_thep", label: "Thép dọc", type: "text", placeholder: "4D16" },
          { key: "dam_dai_thep", label: "Đai", type: "text", placeholder: "D6 a150/200" },
          { key: "h_mai", label: "Mái", type: "heading" },
          { key: "mai_dt", label: "Diện tích", type: "number", unit: "m²" },
          { key: "mai_doc", label: "Độ dốc", type: "number", unit: "%" },
          { key: "xa_go_a", label: "Khoảng cách xà gồ", type: "number", unit: "mm", placeholder: "900" },
          { key: "h_se_no", label: "Sê nô", type: "heading" },
          { key: "se_no_rong", label: "Rộng", type: "number", unit: "cm" },
          { key: "se_no_dai", label: "Dài", type: "number", unit: "m" },
          { key: "ghi_chu", label: "Ghi chú thêm", type: "textarea" },
        ],
      },
    ],
  },
  {
    key: "tuong_ngan",
    name: "Xây tường ngăn phòng",
    sections: [
      {
        col: "method",
        title: "Biện pháp thi công",
        fields: [
          { key: "vua_mac", label: "Vữa xây mác", type: "number", unit: "M", placeholder: "75" },
          { key: "lanh_to", label: "Lanh tô cửa", type: "select", options: ["Đổ tại chỗ", "Đúc sẵn", "Không có"] },
          { key: "giang_tuong", label: "Giằng tường / bổ trụ", type: "select", options: ["Có", "Không"] },
        ],
      },
      {
        col: "materialSpec",
        title: "Chủng loại vật tư",
        fields: [
          { key: "gach", label: "Gạch xây", type: "select", options: GACH },
          { key: "xi_mang", label: "Xi măng", type: "select", options: XI_MANG },
          { key: "cat_xay", label: "Cát xây", type: "select", options: ["Cát xây tô", "Cát hồng pha"] },
        ],
      },
      {
        col: "dimensions",
        title: "Kích thước",
        fields: [
          { key: "tuong_day", label: "Dày tường", type: "select", options: ["100", "200"] },
          { key: "tuong_cao", label: "Cao (tới đáy dầm/mái)", type: "number", unit: "m" },
          { key: "tuong_dai", label: "Tổng dài các mảng tường", type: "number", unit: "m" },
          { key: "cua_chua_lo", label: "Cửa chừa lỗ (loại + KT + SL)", type: "textarea", placeholder: "Cửa đi 0.8×2.1 ×3; cửa WC 0.7×2.1 ×2…" },
          { key: "ghi_chu", label: "Ghi chú thêm", type: "textarea", placeholder: "Vị trí các mảng tường / đính bản vẽ mặt bằng 📎" },
        ],
      },
    ],
  },
  {
    key: "to_trat",
    name: "Tô trát",
    sections: [
      {
        col: "method",
        title: "Biện pháp thi công",
        fields: [
          { key: "pham_vi", label: "Phạm vi tô", type: "select", options: ["Trong + ngoài", "Chỉ trong", "Chỉ ngoài"] },
          { key: "day", label: "Dày lớp tô", type: "number", unit: "mm", placeholder: "15" },
          { key: "vua_mac", label: "Vữa mác", type: "number", unit: "M", placeholder: "75" },
          { key: "luoi", label: "Lưới chống nứt mối nối", type: "select", options: ["Có", "Không"] },
          { key: "to_tran", label: "Tô trần", type: "select", options: ["Có", "Không"] },
        ],
      },
      {
        col: "materialSpec",
        title: "Chủng loại vật tư",
        fields: [
          { key: "xi_mang", label: "Xi măng", type: "select", options: XI_MANG },
          { key: "cat", label: "Cát tô", type: "select", options: ["Cát xây tô", "Cát hồng pha"] },
        ],
      },
      {
        col: "dimensions",
        title: "Kích thước",
        fields: [
          { key: "cao_do", label: "Cao độ tô tới", type: "select", options: ["Đáy dầm", "Hết trần"] },
          { key: "tran_dt", label: "Diện tích trần tô", type: "number", unit: "m²" },
          { key: "khong_to", label: "Vị trí KHÔNG tô", type: "textarea", placeholder: "VD: mảng tường ốp gạch WC…" },
          { key: "ghi_chu", label: "Ghi chú thêm", type: "textarea" },
        ],
      },
    ],
  },
];

export function getTemplate(key: string | null | undefined) {
  return ESTIMATE_TEMPLATES.find((t) => t.key === key) ?? null;
}

// Sinh text 3 cột từ formData — field trống bỏ qua; heading chỉ in khi cụm có dữ liệu.
export function renderFormText(templateKey: string, formData: Record<string, unknown>) {
  const tpl = getTemplate(templateKey);
  if (!tpl) return null;

  const out: Record<"method" | "materialSpec" | "dimensions", string> = {
    method: "",
    materialSpec: "",
    dimensions: "",
  };

  for (const section of tpl.sections) {
    const lines: string[] = [];
    let pendingHeading: string | null = null;
    for (const f of section.fields) {
      if (f.type === "heading") {
        pendingHeading = f.label;
        continue;
      }
      const raw = formData[f.key];
      const value = raw == null ? "" : String(raw).trim();
      if (!value) continue;
      if (pendingHeading) {
        lines.push(`[${pendingHeading}]`);
        pendingHeading = null;
      }
      const unit = "unit" in f && f.unit ? f.unit : "";
      // Mác bê tông/vữa viết tiền tố (M250), đơn vị khác viết hậu tố (20 cm)
      const rendered = unit === "M" ? `M${value}` : unit ? `${value} ${unit}` : value;
      lines.push(`• ${f.label}: ${rendered}`);
    }
    out[section.col] = lines.join("\n");
  }
  return out;
}
