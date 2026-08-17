"use client";

import { useState } from "react";
import {
  costNc,
  itemCost,
  thoSummary,
  DEFAULT_MARKUP_THO,
  type EDItem,
  type EstimateDetail,
} from "@/lib/estimate-detail";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

type Block = { key: string; name: string; tag?: string; items: EDItem[]; isGroup: boolean };

export function CostDetailSection({
  contractId,
  detail,
  dtTong,
  locked,
}: {
  contractId: string;
  detail: EstimateDetail;
  dtTong: number;
  locked?: boolean;
}) {
  const withCost = (detail?.items ?? []).filter((it) => it.cost);
  const [markup, setMarkup] = useState<number>(detail?.markupTho ?? DEFAULT_MARKUP_THO);
  const [savingMk, setSavingMk] = useState(false);
  const [mkMsg, setMkMsg] = useState<string | null>(null);

  if (withCost.length === 0) {
    return <div className="gv-empty">Chưa có dữ liệu giá vốn cho hợp đồng này.</div>;
  }

  // Gộp hạng mục cùng group thành 1 block (vd Bê tông); còn lại mỗi mục 1 block.
  const blocks: Block[] = [];
  for (const it of withCost) {
    if (it.group) {
      const last = blocks[blocks.length - 1];
      if (last && last.isGroup && last.key === it.group) {
        last.items.push(it);
      } else {
        blocks.push({ key: it.group, name: it.groupName || it.name, tag: it.tag, items: [it], isGroup: true });
      }
    } else {
      blocks.push({ key: it.id, name: it.name, tag: it.tag, items: [it], isGroup: false });
    }
  }

  let sumNc = 0;
  let sumVt = 0;
  const rows = blocks.map((b) => {
    const mats = b.items.flatMap((it) => it.cost?.materials ?? []);
    const nc = b.items.reduce((s, it) => s + costNc(it.cost), 0);
    const vt = b.items.reduce((s, it) => s + itemCost(it.cost).vt, 0);
    const vtRaw = mats.reduce((s, m) => s + (Number(m.kl) || 0) * (Number(m.gia) || 0), 0);
    const hh = Number(b.items[0]?.cost?.haoHutPct) || 0;
    // NC hiển thị dạng KL×đơn giá nếu hạng mục đơn (1 công tác có ncQty/ncGia)
    const first = b.items[0]?.cost;
    const ncBreak =
      b.items.length === 1 && first?.ncQty != null && first?.ncGia != null
        ? { q: Number(first.ncQty), g: Number(first.ncGia), u: first.ncUnit || "" }
        : null;
    sumNc += nc;
    sumVt += vt;
    return { b, mats, nc, vtRaw, vt, hh, ncBreak, total: nc + vt };
  });

  // Số chảy NGƯỢC phần thô → đơn giá m².
  const s = thoSummary(detail, dtTong);

  async function saveMarkup(pct: number) {
    setSavingMk(true);
    setMkMsg(null);
    const r = await fetch(`/api/admin/design-contracts/${contractId}/estimate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markupTho: pct }),
    });
    setSavingMk(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMkMsg(d.message || "Lưu % lãi thất bại");
    } else {
      setMkMsg("✓ Đã lưu");
      setTimeout(() => setMkMsg(null), 1600);
    }
  }

  const banNow = Math.round(s.von * (1 + markup));
  const donGiaNow = dtTong > 0 ? Math.round(banNow / dtTong) : 0;
  const laiNow = banNow - s.von;

  return (
    <div className="gv">
      {/* Bảng chảy ngược: vốn → +lãi → đơn giá m² khách */}
      <div className="gv-flow">
        <div className="gv-flow-t">Phần thô — giá vốn chảy ngược ra đơn giá m² khách</div>
        <div className="gv-flow-grid">
          <div className="gvf"><span className="k">Nhân công khoán</span><span className="v">{fmt(s.vonNc)}</span></div>
          <div className="gvf"><span className="k">Vật tư (đã +hao hụt)</span><span className="v">{fmt(s.vonVt)}</span></div>
          <div className="gvf tot"><span className="k">Tổng giá vốn thô</span><span className="v">{fmt(s.von)}</span></div>
          <div className="gvf mk">
            <span className="k">% Lãi thô</span>
            <span className="mkrow">
              <input
                type="number"
                min={0}
                max={200}
                step={1}
                disabled={locked || savingMk}
                value={Math.round(markup * 100)}
                onChange={(e) => setMarkup((Number(e.target.value) || 0) / 100)}
                className="mkinp"
              />
              <span className="pct">%</span>
              {!locked && (
                <button
                  type="button"
                  className="mkbtn"
                  disabled={savingMk || markup === (detail?.markupTho ?? DEFAULT_MARKUP_THO)}
                  onClick={() => saveMarkup(markup)}
                >
                  {savingMk ? "…" : "Lưu"}
                </button>
              )}
            </span>
          </div>
          <div className="gvf"><span className="k">Lãi thô</span><span className="v gr">{fmt(laiNow)}</span></div>
          <div className="gvf sell"><span className="k">Tổng bán thô</span><span className="v">{fmt(banNow)}</span></div>
          <div className="gvf big">
            <span className="k">Đơn giá m² khách ({fmt(dtTong)} m² quy đổi)</span>
            <span className="v">{fmt(donGiaNow)} đ/m²</span>
          </div>
        </div>
        {mkMsg && <div className="gv-mkmsg">{mkMsg}</div>}
        {dtTong <= 0 && (
          <div className="gv-mkwarn">⚠ Chưa có diện tích quy đổi (nhập ở báo giá khách) → chưa ra đơn giá m².</div>
        )}
      </div>

      <div className="gv-sum">
        <div className="gv-sum-t">Tổng hợp giá vốn (mọi phần)</div>
        <div className="gv-sum-grid">
          <div><span className="k">Nhân công</span><span className="v">{fmt(sumNc)}</span></div>
          <div><span className="k">Vật tư (đã +hao hụt)</span><span className="v">{fmt(sumVt)}</span></div>
          <div className="tot"><span className="k">Tổng giá vốn</span><span className="v">{fmt(sumNc + sumVt)}</span></div>
        </div>
      </div>

      {rows.map(({ b, mats, nc, vtRaw, vt, hh, ncBreak, total }, i) => {
        const ncOnly = vt === 0 && nc > 0;
        return (
          <div className={`gv-card${ncOnly ? " nc" : ""}`} key={b.key}>
            <div className="gv-hd">
              <span className="gv-nm">{i + 1} · {b.name}{b.tag && <span className="gv-badge">{b.tag}</span>}</span>
              <span className="gv-kq">Vốn: {fmt(total)} đ</span>
            </div>
            <div className="gv-bd">
              <table>
                <thead>
                  <tr><th>Khoản mục</th><th className="n">Khối lượng</th><th className="n">Đơn giá</th><th className="n">Thành tiền</th></tr>
                </thead>
                <tbody>
                  {nc > 0 && (
                    <tr className="ncrow">
                      <td>Nhân công khoán</td>
                      <td className="n">{ncBreak ? `${ncBreak.q.toLocaleString("vi-VN")} ${ncBreak.u}` : "—"}</td>
                      <td className="n">{ncBreak ? fmt(ncBreak.g) : "—"}</td>
                      <td className="n">{fmt(nc)}</td>
                    </tr>
                  )}
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
                  <tr className="sum"><td colSpan={3}>Cộng giá vốn hạng mục</td><td className="n">{fmt(total)}</td></tr>
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
.gv{--pa:#c9622a;--pa2:#b0561f;--ink:#2a2018;--mut:#96897a;--card:#fff;--line:#ecdfce;--soft:#fbf6ef;--gr:#1f8a4c;color:var(--ink)}
.gv-empty{padding:20px;color:var(--mut);font-style:italic}
.gv-flow{background:linear-gradient(180deg,#fff,#fdf7ee);border:1px solid #e6c8a8;border-radius:16px;padding:18px 20px;margin-bottom:16px;box-shadow:0 3px 14px rgba(160,90,30,.08)}
.gv-flow-t{font-weight:800;color:var(--pa2);font-size:13px;letter-spacing:.3px;text-transform:uppercase;margin-bottom:14px}
.gv-flow-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px 26px}
.gvf{display:flex;flex-direction:column;gap:4px}
.gvf .k{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.3px}
.gvf .v{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--ink)}
.gvf .v.gr{color:var(--gr)}
.gvf.tot .v{color:var(--pa2)}
.gvf.sell .v{color:var(--pa2)}
.gvf.big{grid-column:1/-1;border-top:1px dashed #e6c8a8;padding-top:12px;margin-top:2px}
.gvf.big .v{font-size:26px;color:var(--pa2)}
.gvf.mk .mkrow{display:flex;align-items:center;gap:6px}
.mkinp{width:64px;font-size:17px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums;border:1px solid #e6c8a8;border-radius:8px;padding:5px 8px;color:var(--pa2);background:#fff}
.mkinp:disabled{background:#f4ece1;color:var(--mut)}
.mk .pct{font-size:16px;font-weight:800;color:var(--pa2)}
.mkbtn{border:0;background:var(--pa);color:#fff;font-weight:700;font-size:12.5px;padding:6px 12px;border-radius:8px;cursor:pointer}
.mkbtn:disabled{background:#d9c3ad;cursor:default}
.gv-mkmsg{margin-top:10px;font-size:12.5px;color:var(--gr);font-weight:700}
.gv-mkwarn{margin-top:10px;font-size:12.5px;color:#b3261e}
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
.gv tr.ncrow td{background:#f2f7f2;font-weight:700;color:#177a42}
.gv tr.hh td{color:var(--mut);font-style:italic}
.gv tr.sum td{font-weight:800;background:var(--soft);border-top:1px solid #e7dac9}
`;
