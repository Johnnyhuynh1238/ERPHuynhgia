// Tính lại các số tổng của báo giá ở server (sao y công thức trong bao-gia-app.html).
// Dùng khi chuyển HĐ thi công: lấy giá trị HĐ + diện tích + đơn giá từ quoteData.

type QuoteData = {
  project?: string;
  donGiaTho?: number;
  dienTich?: { ten?: string; dt?: number; hs?: number }[];
  thoNhanCong?: number;
  thoHangMuc?: { ten?: string; vt?: { tt?: number }[] }[];
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
