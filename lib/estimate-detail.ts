// Dự toán chi tiết (có bản vẽ) gắn trên HĐ thiết kế.
// Lưu trong DesignContract.estimateDetail (jsonb). Ảnh/PDF bản vẽ lưu MinIO,
// key có tiền tố "estimate/contract/<contractId>/" → route serve kiểm tra tiền tố.

export type EDDrawing = { key: string; name: string; type?: string };

// Vật tư cho màn Giá vốn: khối lượng × đơn giá.
export type EDMaterial = { ten: string; dvt: string; kl: number; gia: number };

// Giá vốn 1 hạng mục = nhân công khoán + Σ(vật tư × (1 + hao hụt%)).
// Nhân công KHOÁN đội theo khối lượng: nc = ncQty × ncGia (đội tự lo máy/dụng cụ).
// Nếu thiếu ncQty/ncGia thì dùng nc nhập thẳng (tương thích data cũ / dòng khoán gói).
export type EDCost = {
  nc: number; // nhân công (đ) — số chốt; = ncQty×ncGia khi có
  ncQty?: number; // khối lượng nhân công khoán (m³/m²/kg…)
  ncGia?: number; // đơn giá NC khoán / đơn vị
  ncUnit?: string; // đơn vị NC khoán
  materials: EDMaterial[];
  haoHutPct: number; // % hao hụt trên vật tư
};

// 1 hạng mục bóc khối lượng: bảng thông số (cols/rows) + công thức + bản vẽ kèm.
export type EDItem = {
  id: string;
  name: string;
  tag?: string; // nhãn nhỏ (vd "đá 1×2 · M250")
  result?: string; // kết quả (vd "7,84 m³")
  cols: string[];
  rows: string[][];
  formula?: string; // diễn giải công thức (xuống dòng bằng \n)
  note?: string;
  drawings: EDDrawing[]; // 1 mục có thể nhiều bản vẽ — không được thiếu
  cost?: EDCost; // dữ liệu màn Giá vốn (cùng hạng mục xuyên suốt 3 màn)
  group?: string; // nhóm hạng mục (vd "betong"): KL đánh số 1-1/1-2, Giá vốn dồn 1 card
  groupName?: string; // tên hiển thị của nhóm ở màn Giá vốn (vd "Bê tông")
  noNum?: boolean; // không đánh số ở màn Khối lượng (vd mục cơ sở diện tích nhân công)
  part?: EDPart; // thuộc phần thô / hoàn thiện — chia số tổng theo phần
  // Hạng mục cha (1 NGUỒN = danh sách hạng mục báo giá khách). Công tác gắn vào 1 hạng mục theo tên.
  hangMuc?: string; // = tên hạng mục trong quoteData.thoPhanBaoGia / hoanThien
  // Chủng loại vật tư khách thấy (loại/quy cách) — chỉ hiển thị ở màn khách, không tính tiền.
  custSpec?: { ten: string; loai?: string; quycach?: string }[];
};

export type EDPart = "tho" | "ht";

// NC khoán 1 hạng mục: ưu tiên KL×đơn giá, fallback nc nhập thẳng.
export function costNc(c?: EDCost): number {
  if (!c) return 0;
  const q = Number(c.ncQty);
  const g = Number(c.ncGia);
  if (isFinite(q) && isFinite(g) && (c.ncQty != null || c.ncGia != null)) return Math.round(q * g);
  return Number(c.nc) || 0;
}

// Giá vốn 1 hạng mục (nhân công khoán + vật tư + hao hụt).
export function itemCost(c?: EDCost): { nc: number; vt: number; total: number } {
  if (!c) return { nc: 0, vt: 0, total: 0 };
  const nc = costNc(c);
  const vtRaw = (c.materials ?? []).reduce((s, m) => s + (Number(m.kl) || 0) * (Number(m.gia) || 0), 0);
  const vt = Math.round(vtRaw * (1 + (Number(c.haoHutPct) || 0) / 100));
  return { nc, vt, total: nc + vt };
}

// Nhân công trọn gói toàn bộ: 2tr/m² × diện tích bao ngoài (phần chìa ra xa nhất).
export type EDLabor = { donGia: number; dienTich: number; tien: number };

export type EstimateDetail = {
  fullDrawings: EDDrawing[]; // bản vẽ FULL (PDF HSKC/HSKT) — nút xem ở đầu
  items: EDItem[];
  labor?: EDLabor; // (legacy) nhân công trọn gói — giữ để không vỡ HĐ cũ
  markupTho?: number; // % lãi phần thô (0.30 = 30%) — đổi trên UI
};

export const EMPTY_ESTIMATE_DETAIL: EstimateDetail = { fullDrawings: [], items: [] };

export const DEFAULT_MARKUP_THO = 0.3; // 30% lãi trên giá vốn thô

// Số chảy NGƯỢC phần thô: gom vốn (VT+NC) mọi hạng mục thô → +lãi → ÷ m² quy đổi = đơn giá m².
// dtTong = diện tích quy đổi (Σ dt×hs) lấy từ quoteData.dienTich.
export function thoSummary(detail: EstimateDetail | null | undefined, dtTong: number) {
  const items = (detail?.items ?? []).filter((it) => (it.part ?? "tho") === "tho");
  let vonNc = 0;
  let vonVt = 0;
  for (const it of items) {
    const c = itemCost(it.cost);
    vonNc += c.nc;
    vonVt += c.vt;
  }
  const von = vonNc + vonVt;
  const markup = detail?.markupTho ?? DEFAULT_MARKUP_THO;
  // Khách thấy đơn giá m² (làm tròn) × diện tích → tổng bán = đúng cách khách tính (khớp màn báo giá).
  const donGiaM2 = dtTong > 0 ? Math.round((von * (1 + markup)) / dtTong) : 0;
  const ban = Math.round(donGiaM2 * dtTong);
  const lai = ban - von;
  return { vonNc, vonVt, von, markup, ban, donGiaM2, lai, dtTong };
}

// Tiền tố key MinIO hợp lệ cho 1 HĐ — chặn đọc file ngoài phạm vi.
export function estimateKeyPrefix(contractId: string) {
  return `estimate/contract/${contractId}/`;
}

// id neo (anchor) cho 1 hạng mục — dùng chung Hạng mục ↔ Giá vốn ↔ Khối lượng để cuộn tới đúng chỗ.
export function hangMucAnchor(name: string) {
  const slug = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
  return "hm-" + (slug || "x");
}
