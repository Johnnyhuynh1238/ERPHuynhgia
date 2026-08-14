"use client";

import { itemCost, type EstimateDetail } from "@/lib/estimate-detail";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export function CostDetailSection({ detail }: { detail: EstimateDetail }) {
  const items = (detail?.items ?? []).filter((it) => it.cost);
  const labor = detail?.labor;
  if (items.length === 0) {
    return <div className="gv-empty">Chưa có dữ liệu giá vốn cho hợp đồng này.</div>;
  }

  const ncTronGoi = labor?.tien ?? 0;
  let sumVt = 0;
  const rows = items.map((it) => {
    const c = itemCost(it.cost);
    sumVt += c.vt;
    return { it, vt: c.vt };
  });
  const grand = ncTronGoi + sumVt;

  return (
    <div className="gv">
      {/* Bảng tổng hợp giá vốn — trên cùng */}
      <div className="gv-sum">
        <div className="gv-sum-t">TỔNG HỢP GIÁ VỐN</div>
        <div className="gv-sum-grid">
          <div><span className="k">Nhân công trọn gói</span><span className="v">{fmt(ncTronGoi)}</span></div>
          <div><span className="k">Vật tư (đã +hao hụt)</span><span className="v">{fmt(sumVt)}</span></div>
          <div className="tot"><span className="k">TỔNG GIÁ VỐN</span><span className="v">{fmt(grand)}</span></div>
        </div>
      </div>

      {/* Nhân công trọn gói — 1 cục riêng trên cùng */}
      {labor && (
        <div className="gv-card nc">
          <div className="gv-hd">
            <span className="gv-nm">NHÂN CÔNG TRỌN GÓI (toàn bộ)</span>
            <span className="gv-kq">{fmt(labor.tien)} đ</span>
          </div>
          <div className="gv-bd">
            <table>
              <tbody>
                <tr>
                  <td>Nhân công thi công trọn gói toàn nhà</td>
                  <td className="n">{labor.dienTich.toLocaleString("vi-VN")} m²</td>
                  <td className="n">{fmt(labor.donGia)}/m²</td>
                  <td className="n b">{fmt(labor.tien)}</td>
                </tr>
              </tbody>
            </table>
            <div className="gv-note">
              Đơn giá {fmt(labor.donGia)}/m² × diện tích bao ngoài (phần chìa ra xa nhất của nhà) = {labor.dienTich.toLocaleString("vi-VN")} m².
            </div>
          </div>
        </div>
      )}

      {/* Vật tư từng hạng mục */}
      {rows.map(({ it, vt }, i) => {
        const mats = it.cost?.materials ?? [];
        const hh = Number(it.cost?.haoHutPct) || 0;
        const vtRaw = mats.reduce((s, m) => s + (Number(m.kl) || 0) * (Number(m.gia) || 0), 0);
        return (
          <div className="gv-card" key={it.id}>
            <div className="gv-hd">
              <span className="gv-nm">{i + 1} · {it.name}{it.tag && <span className="gv-badge">{it.tag}</span>}</span>
              <span className="gv-kq">Vật tư: {fmt(vt)} đ</span>
            </div>
            <div className="gv-bd">
              <table>
                <thead>
                  <tr><th>Vật tư</th><th className="n">Khối lượng</th><th className="n">Đơn giá</th><th className="n">Thành tiền</th></tr>
                </thead>
                <tbody>
                  {mats.map((m, k) => (
                    <tr key={k}>
                      <td>{m.ten}</td>
                      <td className="n">{Number(m.kl).toLocaleString("vi-VN")} {m.dvt}</td>
                      <td className="n">{fmt(m.gia)}</td>
                      <td className="n">{fmt((Number(m.kl) || 0) * (Number(m.gia) || 0))}</td>
                    </tr>
                  ))}
                  {hh > 0 && (
                    <tr className="hh"><td colSpan={3}>Hao hụt vật tư ({hh}%)</td><td className="n">{fmt(vt - vtRaw)}</td></tr>
                  )}
                  <tr className="sum"><td colSpan={3}>Cộng vật tư</td><td className="n">{fmt(vt)}</td></tr>
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
.gv{--pa:#c9622a;--pa2:#b0561f;--ink:#2a2018;--mut:#96897a;--card:#fff;--line:#ecdfce;--soft:#fbf6ef;color:var(--ink)}
.gv-empty{padding:20px;color:var(--mut);font-style:italic}
.gv-sum{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 20px;margin-bottom:16px;box-shadow:0 2px 10px rgba(120,70,20,.05)}
.gv-sum-t{font-weight:700;color:var(--mut);font-size:12px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:12px}
.gv-sum-grid{display:flex;gap:30px;flex-wrap:wrap}
.gv-sum-grid>div{display:flex;flex-direction:column;gap:3px}
.gv-sum-grid .k{font-size:11.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.3px}
.gv-sum-grid .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--ink)}
.gv-sum-grid .tot .v{color:var(--pa2);font-size:24px}
.gv-card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:12px}
.gv-card.nc{box-shadow:0 2px 10px rgba(31,138,76,.06)}
.gv-hd{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 18px;background:#fff;border-bottom:1px solid var(--line);flex-wrap:wrap}
.gv-card.nc .gv-hd{border-left:3px solid #1f8a4c}
.gv-nm{font-weight:700;color:var(--ink);font-size:15px}
.gv-card.nc .gv-nm{color:#177a42}
.gv-badge{display:inline-block;background:#f2f7f2;color:#1f8a4c;font-weight:700;font-size:11px;padding:2px 9px;border-radius:999px;margin-left:8px}
.gv-kq{font-weight:800;color:var(--pa2);font-variant-numeric:tabular-nums;font-size:14px;white-space:nowrap}
.gv-bd{padding:4px 18px 14px;overflow-x:auto}
.gv table{width:100%;border-collapse:collapse;font-size:13px}
.gv th,.gv td{text-align:left;padding:8px 8px;border-bottom:1px solid #f0e7d9}
.gv th{color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;font-weight:700}
.gv td.n,.gv th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.gv td.b{font-weight:800;color:var(--pa2)}
.gv tr.hh td{color:var(--mut);font-style:italic}
.gv tr.sum td{font-weight:800;background:var(--soft);border-top:1px solid #e7dac9}
.gv-note{margin-top:8px;font-size:12px;color:var(--mut);font-style:italic}
`;
