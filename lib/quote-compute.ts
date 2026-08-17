// Tính lại các số tổng của báo giá ở server (sao y công thức trong bao-gia-app.html).
// Dùng khi chuyển HĐ thi công: lấy giá trị HĐ + diện tích + đơn giá từ quoteData.

import { itemCost, thoSummary, type EstimateDetail } from "./estimate-detail";

type QuoteData = {
  project?: string;
  donGiaTho?: number;
  dienTich?: { ten?: string; dt?: number; hs?: number }[];
  thoNhanCong?: number;
  thoHangMuc?: { ten?: string; vt?: { tt?: number }[] }[];
  thoPhanBaoGia?: { name?: string; dienGiai?: string; vt?: { ten?: string; loai?: string; quycach?: string }[] }[];
  hoanThien?: { name?: string; costs?: { kl?: number | null; gia?: number | null; tt?: number }[] }[];
};

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);

export function quoteSummary(data: unknown) {
  const d = (data ?? {}) as QuoteData;
  const dienTich = Array.isArray(d.dienTich) ? d.dienTich : [];
  const thoHangMuc = Array.isArray(d.thoHangMuc) ? d.thoHangMuc : [];
  const hoanThien = Array.isArray(d.hoanThien) ? d.hoanThien : [];

  const dtTong = dienTich.reduce((s, a) => s + num(a.dt) * num(a.hs), 0); // m² quy đổi
  const areaRaw = dienTich.reduce((s, a) => s + num(a.dt), 0); // m² thực (cho project.areaM2)
  const donGiaTho = num(d.donGiaTho);
  const thoBan = Math.round(donGiaTho * dtTong);

  const thoVt = thoHangMuc.reduce(
    (s, h) => s + (Array.isArray(h.vt) ? h.vt.reduce((x, v) => x + num(v.tt), 0) : 0),
    0,
  );
  const htTotal = hoanThien.reduce((s, m) => {
    const costs = Array.isArray(m.costs) ? m.costs : [];
    return (
      s +
      costs.reduce(
        (x, c) => x + (c.kl != null && c.gia != null ? num(c.kl) * num(c.gia) : num(c.tt)),
        0,
      )
    );
  }, 0);

  const grand = Math.round((thoBan + htTotal) / 1e6) * 1e6;

  return {
    projectName: typeof d.project === "string" ? d.project : "",
    dtTong,
    areaRaw,
    donGiaTho,
    thoBan,
    thoVt,
    thoNhanCong: num(d.thoNhanCong),
    htTotal,
    grand, // tổng báo giá bán cho khách
  };
}

// Đồng bộ báo giá khách (quoteData) TỪ dự toán nội bộ (estimateDetail) — số chảy ngược.
// Phần thô: đơn giá m² = Σ vốn thô ×(1+lãi) ÷ m² quy đổi. Hạng mục + chủng loại (khách)
// lấy từ items thô. Giữ nguyên các trường khác của quoteData (congty/duan/dienTich/thanhToan/hoanThien).
export function syncQuoteFromDetail(quoteData: unknown, detail: EstimateDetail) {
  const d = { ...((quoteData ?? {}) as QuoteData) } as QuoteData & Record<string, unknown>;
  const dtTong = (Array.isArray(d.dienTich) ? d.dienTich : []).reduce(
    (s, a) => s + num(a.dt) * num(a.hs),
    0,
  );
  const s = thoSummary(detail, dtTong);
  const thoItems = (detail.items ?? []).filter((it) => (it.part ?? "tho") === "tho");

  d.donGiaTho = s.donGiaM2;
  d.thoNhanCong = s.vonNc;
  d.thoHangMuc = thoItems.map((it) => ({
    ten: it.name,
    vt: (it.cost?.materials ?? []).map((m) => ({
      ten: m.ten,
      dvt: m.dvt,
      kl: num(m.kl),
      gia: num(m.gia),
      tt: Math.round(num(m.kl) * num(m.gia)),
    })),
  }));
  // Chủng loại VT khách thấy (loại/quy cách) — chỉ hạng mục có custSpec.
  d.thoPhanBaoGia = thoItems
    .filter((it) => Array.isArray(it.custSpec) && it.custSpec.length > 0)
    .map((it) => ({
      name: it.name,
      dienGiai: it.note ?? "",
      vt: (it.custSpec ?? []).map((v) => ({ ten: v.ten, loai: v.loai ?? "", quycach: v.quycach ?? "" })),
    }));
  return { quoteData: d, summary: s };
}

// Tổng vốn (VT+NC mọi hạng mục) — dùng đối chiếu lãi.
export function costGrand(detail: EstimateDetail) {
  return (detail.items ?? []).reduce((s, it) => s + itemCost(it.cost).total, 0);
}
