// Dự toán chi tiết (có bản vẽ) gắn trên HĐ thiết kế.
// Lưu trong DesignContract.estimateDetail (jsonb). Ảnh/PDF bản vẽ lưu MinIO,
// key có tiền tố "estimate/contract/<contractId>/" → route serve kiểm tra tiền tố.

export type EDDrawing = { key: string; name: string; type?: string };

// Vật tư cho màn Giá vốn: khối lượng × đơn giá.
export type EDMaterial = { ten: string; dvt: string; kl: number; gia: number };

// Giá vốn 1 hạng mục = nhân công + Σ(vật tư × (1 + hao hụt%)).
export type EDCost = {
  nc: number; // nhân công (dòng đầu)
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
};

// Giá vốn 1 hạng mục (nhân công + vật tư + hao hụt).
export function itemCost(c?: EDCost): { nc: number; vt: number; total: number } {
  if (!c) return { nc: 0, vt: 0, total: 0 };
  const nc = Number(c.nc) || 0;
  const vtRaw = (c.materials ?? []).reduce((s, m) => s + (Number(m.kl) || 0) * (Number(m.gia) || 0), 0);
  const vt = Math.round(vtRaw * (1 + (Number(c.haoHutPct) || 0) / 100));
  return { nc, vt, total: nc + vt };
}

// Nhân công trọn gói toàn bộ: 2tr/m² × diện tích bao ngoài (phần chìa ra xa nhất).
export type EDLabor = { donGia: number; dienTich: number; tien: number };

export type EstimateDetail = {
  fullDrawings: EDDrawing[]; // bản vẽ FULL (PDF HSKC/HSKT) — nút xem ở đầu
  items: EDItem[];
  labor?: EDLabor; // nhân công trọn gói (màn Giá vốn) — đặt riêng trên cùng
};

export const EMPTY_ESTIMATE_DETAIL: EstimateDetail = { fullDrawings: [], items: [] };

// Tiền tố key MinIO hợp lệ cho 1 HĐ — chặn đọc file ngoài phạm vi.
export function estimateKeyPrefix(contractId: string) {
  return `estimate/contract/${contractId}/`;
}
