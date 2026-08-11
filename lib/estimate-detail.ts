// Dự toán chi tiết (có bản vẽ) gắn trên HĐ thiết kế.
// Lưu trong DesignContract.estimateDetail (jsonb). Ảnh/PDF bản vẽ lưu MinIO,
// key có tiền tố "estimate/contract/<contractId>/" → route serve kiểm tra tiền tố.

export type EDDrawing = { key: string; name: string; type?: string };

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
};

export type EstimateDetail = {
  fullDrawings: EDDrawing[]; // bản vẽ FULL (PDF HSKC/HSKT) — nút xem ở đầu
  items: EDItem[];
};

export const EMPTY_ESTIMATE_DETAIL: EstimateDetail = { fullDrawings: [], items: [] };

// Tiền tố key MinIO hợp lệ cho 1 HĐ — chặn đọc file ngoài phạm vi.
export function estimateKeyPrefix(contractId: string) {
  return `estimate/contract/${contractId}/`;
}
