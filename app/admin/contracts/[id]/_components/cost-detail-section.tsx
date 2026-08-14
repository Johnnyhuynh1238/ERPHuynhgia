"use client";

import { itemCost, type EstimateDetail } from "@/lib/estimate-detail";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export function CostDetailSection({ detail }: { detail: EstimateDetail }) {
  const items = (detail?.items ?? []).filter((it) => it.cost);
  if (items.length === 0) {
    return <div className="gv-empty">Chưa có dữ liệu giá vốn cho hợp đồng này.</div>;
  }

  let sumNc = 0;
  let sumVt = 0;
  const rows = items.map((it) => {
    const c = itemCost(it.cost);
    sumNc += c.nc;
    sumVt += c.vt;
    return { it, c };
  });
  const grand = sumNc + sumVt;

  return (
    <div className="gv">
      {/* Bảng tổng hợp giá vốn — trên cùng */}
      <div className="gv-sum">
        <div className="gv-sum-t">TỔNG HỢP GIÁ VỐN</div>
        <div className="gv-sum-grid">
          <div><span className="k">Nhân công</span><span className="v">{fmt(sumNc)}</span></div>
          <div><span className="k">Vật tư (đã +hao hụt)</span><span className="v">{fmt(sumVt)}</span></div>
          <div className="tot"><span className="k">TỔNG GIÁ VỐN</span><span className="v">{fmt(grand)}</span></div>
        </div>
      </div>

      {rows.map(({ it, c }, i) => {
        const mats = it.cost?.materials ?? [];
        const hh = Number(it.cost?.haoHutPct) || 0;
        return (
          <div className="gv-card" key={it.id}>
            <div className="gv-hd">
              <span className="gv-nm">{i + 1} · {it.name}{it.tag && <span className="gv-badge">{it.tag}</span>}</span>
              <span className="gv-kq">Vốn: {fmt(c.total)} đ</span>
            </div>
            <div className="gv-bd">
              <table>
                <thead>
                  <tr><th>Khoản mục</th><th className="n">Khối lượng</th><th className="n">Đơn giá</th><th className="n">Thành tiền</th></tr>
                </thead>
                <tbody>
                  <tr className="nc">
                    <td>Nhân công</td><td className="n">—</td><td className="n">—</td><td className="n">{fmt(c.nc)}</td>
                  </tr>
                  {mats.map((m, k) => (
                    <tr key={k}>
                      <td>{m.ten}</td>
                      <td className="n">{Number(m.kl).toLocaleString("vi-VN")} {m.dvt}</td>
                      <td className="n">{fmt(m.gia)}</td>
                      <td className="n">{fmt((Number(m.kl) || 0) * (Number(m.gia) || 0))}</td>
                    </tr>
                  ))}
                  {hh > 0 && (
                    <tr className="hh">
                      <td colSpan={3}>Hao hụt vật tư ({hh}%)</td>
                      <td className="n">{fmt(c.vt - mats.reduce((s, m) => s + (Number(m.kl) || 0) * (Number(m.gia) || 0), 0))}</td>
                    </tr>
                  )}
                  <tr className="sum">
                    <td colSpan={3}>Cộng giá vốn hạng mục</td>
                    <td className="n">{fmt(c.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.gv{--pa:#c9622a;--pa2:#a94e1f;--ink:#2a2018;--mut:#8a7a6b;--card:#fff;--line:#e7dac9;--soft:#faf4ec;--hd:#f6e7d4;color:var(--ink)}
.gv-empty{padding:20px;color:var(--mut);font-style:italic}
.gv-sum{background:linear-gradient(135deg,#fff,#fbf1e6);border:1px solid var(--line);border-left:5px solid var(--pa);border-radius:14px;padding:16px 20px;margin-bottom:20px}
.gv-sum-t{font-weight:800;color:var(--pa2);font-size:14px;letter-spacing:.4px;margin-bottom:12px}
.gv-sum-grid{display:flex;gap:26px;flex-wrap:wrap}
.gv-sum-grid>div{display:flex;flex-direction:column;gap:2px}
.gv-sum-grid .k{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.3px}
.gv-sum-grid .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.gv-sum-grid .tot .v{color:var(--pa2);font-size:24px}
.gv-card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:14px;box-shadow:0 2px 9px rgba(120,70,20,.04)}
.gv-hd{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 18px;background:var(--hd);border-bottom:1px solid var(--line);flex-wrap:wrap}
.gv-nm{font-weight:800;color:var(--pa2);font-size:15px}
.gv-badge{display:inline-block;background:#eef4ee;color:#1f8a4c;font-weight:800;font-size:11px;padding:2px 9px;border-radius:999px;margin-left:8px}
.gv-kq{font-weight:800;color:var(--pa2);font-variant-numeric:tabular-nums;background:#fff;border:1px solid #e6c8a8;border-radius:999px;padding:4px 13px;white-space:nowrap}
.gv-bd{padding:6px 18px 14px;overflow-x:auto}
.gv table{width:100%;border-collapse:collapse;font-size:13px}
.gv th,.gv td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}
.gv th{color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;font-weight:800}
.gv td.n,.gv th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.gv tr.nc td{background:#fbf6ef;font-weight:700}
.gv tr.hh td{color:var(--mut);font-style:italic}
.gv tr.sum td{font-weight:800;background:var(--soft);border-top:2px solid var(--line)}
`;
