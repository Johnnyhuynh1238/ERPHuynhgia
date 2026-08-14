"use client";

import { itemCost, type EstimateDetail } from "@/lib/estimate-detail";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const LOI_PCT = 30; // lời mặc định trên giá vốn
const roundTo = (n: number, step = 1000) => Math.round(n / step) * step;

// Màn Báo giá native (cùng hạng mục): giá bán = giá vốn × (1 + lời%).
export function BaoGiaSection({ detail }: { detail: EstimateDetail }) {
  const items = (detail?.items ?? []).filter((it) => it.cost);
  if (items.length === 0) {
    return <div className="bg-empty">Chưa có dữ liệu báo giá cho hợp đồng này.</div>;
  }

  let sumVon = 0;
  let sumBan = 0;
  const rows = items.map((it) => {
    const von = itemCost(it.cost).total;
    const ban = roundTo(von * (1 + LOI_PCT / 100));
    sumVon += von;
    sumBan += ban;
    return { it, von, ban };
  });
  const grand = roundTo(sumBan, 1_000_000);
  const loi = grand - sumVon;

  return (
    <div className="bg">
      <div className="bg-sum">
        <div className="bg-sum-t">TỔNG BÁO GIÁ (chưa VAT)</div>
        <div className="bg-big">{fmt(grand)} đ</div>
        <div className="bg-sum-grid">
          <div><span className="k">Tổng giá vốn</span><span className="v">{fmt(sumVon)}</span></div>
          <div><span className="k">Lời (~{LOI_PCT}%)</span><span className="v ok">{fmt(loi)}</span></div>
        </div>
      </div>

      <div className="bg-card">
        <table>
          <thead>
            <tr><th>#</th><th>Hạng mục</th><th className="n">Giá vốn</th><th className="n">Lời {LOI_PCT}%</th><th className="n">Giá bán</th></tr>
          </thead>
          <tbody>
            {rows.map(({ it, von, ban }, i) => (
              <tr key={it.id}>
                <td className="n">{i + 1}</td>
                <td>{it.name}{it.tag && <span className="bg-badge">{it.tag}</span>}</td>
                <td className="n">{fmt(von)}</td>
                <td className="n">{fmt(ban - von)}</td>
                <td className="n b">{fmt(ban)}</td>
              </tr>
            ))}
            <tr className="sum">
              <td className="n" colSpan={2}>TỔNG CỘNG</td>
              <td className="n">{fmt(sumVon)}</td>
              <td className="n">{fmt(sumBan - sumVon)}</td>
              <td className="n b">{fmt(grand)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="bg-note">Giá bán từng hạng mục = giá vốn × (1 + {LOI_PCT}%), làm tròn. Tổng làm tròn tới triệu. Chưa gồm dự phòng/chi phí khác nếu tính riêng.</p>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.bg{--pa:#c9622a;--pa2:#a94e1f;--mut:#8a7a6b;--line:#e7dac9;--soft:#faf4ec;--gr:#1f8a4c;color:#2a2018}
.bg-empty{padding:20px;color:var(--mut);font-style:italic}
.bg-sum{background:linear-gradient(135deg,#fff,#fbf1e6);border:1px solid var(--line);border-left:5px solid var(--pa);border-radius:14px;padding:16px 20px;margin-bottom:18px}
.bg-sum-t{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px}
.bg-big{font-size:34px;font-weight:800;color:var(--pa2);margin:2px 0 8px}
.bg-sum-grid{display:flex;gap:26px;flex-wrap:wrap;border-top:1px dashed var(--line);padding-top:10px}
.bg-sum-grid>div{display:flex;flex-direction:column}
.bg-sum-grid .k{font-size:12px;color:var(--mut)}
.bg-sum-grid .v{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
.bg-sum-grid .v.ok{color:var(--gr)}
.bg-card{background:#fff;border:1px solid var(--line);border-radius:14px;overflow-x:auto;box-shadow:0 2px 9px rgba(120,70,20,.04)}
.bg table{width:100%;border-collapse:collapse;font-size:13.5px}
.bg th,.bg td{text-align:left;padding:9px 11px;border-bottom:1px solid var(--line)}
.bg th{color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;font-weight:800}
.bg td.n,.bg th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.bg td.b{font-weight:800;color:var(--pa2)}
.bg-badge{display:inline-block;background:#eef4ee;color:var(--gr);font-weight:800;font-size:10.5px;padding:1px 8px;border-radius:999px;margin-left:7px}
.bg tr.sum td{font-weight:800;background:var(--soft);border-top:2px solid var(--line)}
.bg-note{color:var(--mut);font-size:12px;font-style:italic;margin-top:10px}
`;
