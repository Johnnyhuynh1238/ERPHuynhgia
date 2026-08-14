"use client";

import { itemCost, type EstimateDetail } from "@/lib/estimate-detail";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const LOI_THO_PCT = 30; // lời trên giá vốn phần thô
const roundTo = (n: number, step = 1000) => Math.round(n / step) * step;
const isTho = (id: string) => !id.startsWith("ht_"); // hoàn thiện = id "ht_*"

// Báo giá native (như báo giá khách): PHẦN THÔ gộp 1 cục (giá vốn +30%),
// HOÀN THIỆN tách từng hạng mục (giữ nguyên giá vốn).
export function BaoGiaSection({ detail }: { detail: EstimateDetail }) {
  const items = (detail?.items ?? []).filter((it) => it.cost);
  if (items.length === 0) {
    return <div className="bg-empty">Chưa có dữ liệu báo giá cho hợp đồng này.</div>;
  }

  const thoVon = items.filter((it) => isTho(it.id)).reduce((s, it) => s + itemCost(it.cost).total, 0);
  const thoBan = roundTo(thoVon * (1 + LOI_THO_PCT / 100));

  const htRows = items
    .filter((it) => !isTho(it.id))
    .map((it) => ({ it, ban: itemCost(it.cost).total }));
  const htTotal = htRows.reduce((s, r) => s + r.ban, 0);

  const grand = roundTo(thoBan + htTotal, 1_000_000);

  return (
    <div className="bg">
      <div className="bg-sum">
        <div className="bg-sum-t">TỔNG GIÁ TRỊ HỢP ĐỒNG (chưa VAT)</div>
        <div className="bg-big">{fmt(grand)} đ</div>
        <div className="bg-sum-grid">
          <div><span className="k">Phần thô</span><span className="v">{fmt(thoBan)}</span></div>
          <div><span className="k">Hoàn thiện</span><span className="v">{fmt(htTotal)}</span></div>
        </div>
      </div>

      {/* PHẦN THÔ — gộp 1 cục */}
      <div className="bg-card">
        <div className="bg-hd">PHẦN THÔ (trọn gói)</div>
        <div className="bg-thobody">
          <div className="bg-tho-amt">{fmt(thoBan)} đ</div>
          <div className="bg-tho-note">
            Gồm toàn bộ kết cấu bê tông cốt thép, xây tô, mái tôn, điện – nước thô, chống thấm.
            <br />Giá vốn {fmt(thoVon)} + lời {LOI_THO_PCT}%.
          </div>
        </div>
      </div>

      {/* HOÀN THIỆN — tách từng hạng mục */}
      <div className="bg-card">
        <div className="bg-hd">HOÀN THIỆN</div>
        <table>
          <thead>
            <tr><th>#</th><th>Hạng mục</th><th className="n">Thành tiền</th></tr>
          </thead>
          <tbody>
            {htRows.map(({ it, ban }, i) => (
              <tr key={it.id}>
                <td className="n">{i + 1}</td>
                <td>{it.name}</td>
                <td className="n b">{fmt(ban)}</td>
              </tr>
            ))}
            <tr className="sum">
              <td className="n" colSpan={2}>Cộng hoàn thiện</td>
              <td className="n b">{fmt(htTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-total">
        <span>TỔNG CỘNG (chưa VAT)</span>
        <span className="amt">{fmt(grand)} đ</span>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.bg{--pa:#c9622a;--pa2:#a94e1f;--mut:#8a7a6b;--line:#e7dac9;--soft:#faf4ec;--gr:#1f8a4c;color:#2a2018}
.bg-empty{padding:20px;color:var(--mut);font-style:italic}
.bg-sum{background:linear-gradient(135deg,#fff,#fbf1e6);border:1px solid var(--line);border-left:5px solid var(--pa);border-radius:14px;padding:16px 20px;margin-bottom:16px}
.bg-sum-t{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px}
.bg-big{font-size:34px;font-weight:800;color:var(--pa2);margin:2px 0 8px}
.bg-sum-grid{display:flex;gap:26px;flex-wrap:wrap;border-top:1px dashed var(--line);padding-top:10px}
.bg-sum-grid>div{display:flex;flex-direction:column}
.bg-sum-grid .k{font-size:12px;color:var(--mut)}
.bg-sum-grid .v{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
.bg-card{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 2px 9px rgba(120,70,20,.04);margin-bottom:14px}
.bg-hd{padding:11px 18px;background:var(--soft);border-bottom:1px solid var(--line);font-weight:800;color:var(--pa2);font-size:14px}
.bg-thobody{padding:16px 18px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.bg-tho-amt{font-size:26px;font-weight:800;color:var(--pa2);font-variant-numeric:tabular-nums;white-space:nowrap}
.bg-tho-note{font-size:12.5px;color:var(--mut);font-style:italic;line-height:1.6}
.bg table{width:100%;border-collapse:collapse;font-size:13.5px}
.bg th,.bg td{text-align:left;padding:9px 14px;border-bottom:1px solid var(--line)}
.bg th{color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;font-weight:800}
.bg td.n,.bg th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.bg td.b{font-weight:700;color:var(--pa2)}
.bg tr.sum td{font-weight:800;background:var(--soft);border-top:2px solid var(--line)}
.bg-total{display:flex;justify-content:space-between;align-items:center;background:var(--pa2);color:#fff;border-radius:12px;padding:14px 20px;font-weight:800;font-size:16px}
.bg-total .amt{font-size:22px;font-variant-numeric:tabular-nums}
`;
