"use client";

import { useMemo, useState } from "react";
import {
  costNc,
  itemCost,
  thoSummary,
  DEFAULT_MARKUP_THO,
  type EDItem,
  type EstimateDetail,
} from "@/lib/estimate-detail";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `i${Date.now()}${Math.random()}`;

function blankItem(): EDItem {
  return {
    id: uid(),
    name: "Hạng mục mới",
    part: "tho",
    cols: [],
    rows: [],
    drawings: [],
    custSpec: [],
    cost: { nc: 0, ncQty: undefined, ncGia: undefined, ncUnit: "", materials: [], haoHutPct: 0 },
  };
}

// Editor hạng mục = 1 NGUỒN. Thêm/sửa/xoá → KL·Giá vốn·Báo giá khách đều theo.
export function QuoteItemsEditor({
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
  const [items, setItems] = useState<EDItem[]>(() =>
    (detail?.items ?? []).map((it) => ({ ...it, cost: it.cost ? { ...it.cost } : { nc: 0, materials: [], haoHutPct: 0 } })),
  );
  const [markup, setMarkup] = useState<number>(detail?.markupTho ?? DEFAULT_MARKUP_THO);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const touch = () => { if (!dirty) setDirty(true); setMsg(null); };

  const set = (idx: number, patch: Partial<EDItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    touch();
  };
  const setCost = (idx: number, patch: Partial<NonNullable<EDItem["cost"]>>) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, cost: { ...(it.cost ?? { nc: 0, materials: [], haoHutPct: 0 }), ...patch } } : it,
      ),
    );
    touch();
  };

  const addItem = () => { setItems((p) => [...p, blankItem()]); touch(); };
  const delItem = (idx: number) => {
    if (!confirm(`Xoá hạng mục "${items[idx]?.name}"? Không hoàn tác được.`)) return;
    setItems((p) => p.filter((_, i) => i !== idx));
    touch();
  };

  const detailNow: EstimateDetail = useMemo(() => ({ ...detail, items, markupTho: markup }), [detail, items, markup]);
  const s = thoSummary(detailNow, dtTong);

  async function save() {
    setSaving(true);
    setMsg(null);
    const r = await fetch(`/api/admin/design-contracts/${contractId}/estimate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, markupTho: markup }),
    });
    setSaving(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg("⚠ " + (d.message || "Lưu thất bại"));
      return;
    }
    setDirty(false);
    setMsg("✓ Đã lưu — đơn giá m² đã đẩy sang báo giá khách.");
    setTimeout(() => setMsg(null), 2600);
  }

  const NC_UNITS = ["m³", "m²", "md", "kg", "viên", "gói", "bộ", "cái"];

  return (
    <div className="qe">
      <div className="qe-top">
        <div className="qe-top-t">Hạng mục — 1 nguồn (thêm ở đây → Khối lượng · Giá vốn · Báo giá khách đều hiện)</div>
        {!locked && (
          <button type="button" className="qe-add" onClick={addItem}>+ Thêm hạng mục</button>
        )}
      </div>

      {items.length === 0 && <div className="qe-empty">Chưa có hạng mục. Bấm “+ Thêm hạng mục”.</div>}

      {items.map((it, idx) => {
        const c = it.cost ?? { nc: 0, materials: [], haoHutPct: 0 };
        const nc = costNc(c);
        const cc = itemCost(c);
        return (
          <div className="qe-card" key={it.id}>
            <div className="qe-hd">
              <select className="qe-part" value={it.part ?? "tho"} disabled={locked} onChange={(e) => set(idx, { part: e.target.value as "tho" | "ht" })}>
                <option value="tho">Thô</option>
                <option value="ht">Hoàn thiện</option>
              </select>
              <input className="qe-nm" value={it.name} disabled={locked} placeholder="Tên hạng mục" onChange={(e) => set(idx, { name: e.target.value })} />
              <input className="qe-tag" value={it.tag ?? ""} disabled={locked} placeholder="nhãn (vd M250)" onChange={(e) => set(idx, { tag: e.target.value })} />
              <span className="qe-von">Vốn: {fmt(cc.total)} đ</span>
              {!locked && <button type="button" className="qe-del" title="Xoá hạng mục" onClick={() => delItem(idx)}>✕</button>}
            </div>

            <div className="qe-cols">
              {/* Chủng loại VT khách thấy */}
              <div className="qe-sec">
                <div className="qe-sec-h">
                  <span>Chủng loại vật tư (khách thấy)</span>
                  {!locked && <button type="button" className="qe-mini" onClick={() => set(idx, { custSpec: [...(it.custSpec ?? []), { ten: "", loai: "", quycach: "" }] })}>+ dòng</button>}
                </div>
                <table className="qe-tbl">
                  <thead><tr><th>Tên</th><th>Chủng loại</th><th>Quy cách</th><th></th></tr></thead>
                  <tbody>
                    {(it.custSpec ?? []).map((v, k) => (
                      <tr key={k}>
                        <td><input value={v.ten} disabled={locked} onChange={(e) => { const cs = [...(it.custSpec ?? [])]; cs[k] = { ...cs[k], ten: e.target.value }; set(idx, { custSpec: cs }); }} /></td>
                        <td><input value={v.loai ?? ""} disabled={locked} onChange={(e) => { const cs = [...(it.custSpec ?? [])]; cs[k] = { ...cs[k], loai: e.target.value }; set(idx, { custSpec: cs }); }} /></td>
                        <td><input value={v.quycach ?? ""} disabled={locked} onChange={(e) => { const cs = [...(it.custSpec ?? [])]; cs[k] = { ...cs[k], quycach: e.target.value }; set(idx, { custSpec: cs }); }} /></td>
                        <td className="x">{!locked && <button type="button" onClick={() => { const cs = (it.custSpec ?? []).filter((_, j) => j !== k); set(idx, { custSpec: cs }); }}>✕</button>}</td>
                      </tr>
                    ))}
                    {(it.custSpec ?? []).length === 0 && <tr><td colSpan={4} className="qe-none">— chưa có —</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* Giá vốn: NC khoán + Vật tư */}
              <div className="qe-sec">
                <div className="qe-sec-h"><span>Nhân công khoán (KL × đơn giá)</span></div>
                <div className="qe-ncrow">
                  <input className="qn" type="number" value={c.ncQty ?? ""} disabled={locked} placeholder="KL" onChange={(e) => setCost(idx, { ncQty: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  <select className="qu" value={c.ncUnit ?? ""} disabled={locked} onChange={(e) => setCost(idx, { ncUnit: e.target.value })}>
                    <option value="">đvt</option>
                    {NC_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <span className="qx">×</span>
                  <input className="qn" type="number" value={c.ncGia ?? ""} disabled={locked} placeholder="đơn giá NC" onChange={(e) => setCost(idx, { ncGia: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  <span className="qeq">= <b>{fmt(nc)}</b> đ</span>
                </div>

                <div className="qe-sec-h" style={{ marginTop: 10 }}>
                  <span>Vật tư (HG mua)</span>
                  {!locked && <button type="button" className="qe-mini" onClick={() => setCost(idx, { materials: [...(c.materials ?? []), { ten: "", dvt: "", kl: 0, gia: 0 }] })}>+ dòng</button>}
                </div>
                <table className="qe-tbl">
                  <thead><tr><th>Vật tư</th><th className="n">KL</th><th>ĐVT</th><th className="n">Đơn giá</th><th className="n">T.tiền</th><th></th></tr></thead>
                  <tbody>
                    {(c.materials ?? []).map((m, k) => (
                      <tr key={k}>
                        <td><input value={m.ten} disabled={locked} onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], ten: e.target.value }; setCost(idx, { materials: ms }); }} /></td>
                        <td className="n"><input className="qn" type="number" value={m.kl || ""} disabled={locked} onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], kl: Number(e.target.value) || 0 }; setCost(idx, { materials: ms }); }} /></td>
                        <td><input className="qsm" value={m.dvt} disabled={locked} onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], dvt: e.target.value }; setCost(idx, { materials: ms }); }} /></td>
                        <td className="n"><input className="qn" type="number" value={m.gia || ""} disabled={locked} onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], gia: Number(e.target.value) || 0 }; setCost(idx, { materials: ms }); }} /></td>
                        <td className="n mono">{fmt((Number(m.kl) || 0) * (Number(m.gia) || 0))}</td>
                        <td className="x">{!locked && <button type="button" onClick={() => { const ms = (c.materials ?? []).filter((_, j) => j !== k); setCost(idx, { materials: ms }); }}>✕</button>}</td>
                      </tr>
                    ))}
                    {(c.materials ?? []).length === 0 && <tr><td colSpan={6} className="qe-none">— chưa có —</td></tr>}
                  </tbody>
                </table>
                <div className="qe-hh">
                  Hao hụt VT:
                  <input className="qn" type="number" value={c.haoHutPct || ""} disabled={locked} onChange={(e) => setCost(idx, { haoHutPct: Number(e.target.value) || 0 })} />%
                  <span className="qe-vt">Vốn VT: {fmt(cc.vt)} đ</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Thanh tổng chảy ngược + Lưu */}
      <div className="qe-bar">
        <div className="qe-bar-grid">
          <div><span className="k">Vốn thô (VT+NC)</span><span className="v">{fmt(s.von)}</span></div>
          <div className="mk">
            <span className="k">% Lãi thô</span>
            <span className="mkrow">
              <input type="number" min={0} max={200} value={Math.round(markup * 100)} disabled={locked} onChange={(e) => { setMarkup((Number(e.target.value) || 0) / 100); touch(); }} className="mkinp" />%
            </span>
          </div>
          <div><span className="k">Lãi thô</span><span className="v gr">{fmt(s.lai)}</span></div>
          <div><span className="k">Tổng bán thô</span><span className="v">{fmt(s.ban)}</span></div>
          <div className="big"><span className="k">Đơn giá m² khách ({fmt(dtTong)} m²)</span><span className="v">{fmt(s.donGiaM2)} đ/m²</span></div>
        </div>
        {!locked && (
          <button type="button" className="qe-save" onClick={save} disabled={saving || !dirty}>
            {saving ? "Đang lưu…" : dirty ? "💾 Lưu + đẩy sang khách" : "Đã lưu"}
          </button>
        )}
        {msg && <div className={`qe-msg${msg.startsWith("⚠") ? " err" : ""}`}>{msg}</div>}
        {dtTong <= 0 && <div className="qe-msg err">⚠ Chưa có diện tích quy đổi (nhập ở báo giá khách) → chưa ra đơn giá m².</div>}
        {locked && <div className="qe-msg">HĐ đã chuyển thi công — chỉ xem.</div>}
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.qe{--pa:#c9622a;--pa2:#b0561f;--ink:#2a2018;--mut:#96897a;--line:#ecdfce;--soft:#fbf6ef;--gr:#1f8a4c;color:var(--ink);padding-bottom:120px}
.qe-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.qe-top-t{font-weight:800;color:var(--pa2);font-size:13.5px}
.qe-add{border:0;background:var(--pa);color:#fff;font-weight:800;font-size:13px;padding:9px 16px;border-radius:10px;cursor:pointer}
.qe-empty{padding:20px;color:var(--mut);font-style:italic}
.qe-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:12px;box-shadow:0 2px 10px rgba(120,70,20,.05)}
.qe-hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.qe-part{border:1px solid var(--line);border-radius:8px;padding:7px 8px;font-size:12.5px;background:var(--soft);color:var(--ink);font-family:inherit}
.qe-nm{flex:1;min-width:160px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:14.5px;font-weight:700;color:var(--ink)}
.qe-tag{width:130px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:12.5px;color:var(--mut)}
.qe-von{font-weight:800;color:var(--pa2);font-variant-numeric:tabular-nums;font-size:13.5px;white-space:nowrap;margin-left:auto}
.qe-del{border:1px solid #f0d6cf;background:#fdf0ee;color:#b3261e;border-radius:8px;width:30px;height:30px;font-weight:800;cursor:pointer}
.qe-cols{display:grid;grid-template-columns:1fr 1.2fr;gap:14px}
@media(max-width:860px){.qe-cols{grid-template-columns:1fr}}
.qe-sec{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:9px 11px}
.qe-sec-h{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:var(--mut);margin-bottom:6px}
.qe-mini{border:1px solid var(--line);background:#fff;color:var(--pa2);border-radius:7px;padding:3px 9px;font-size:11.5px;font-weight:700;cursor:pointer}
.qe-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.qe-tbl th{text-align:left;color:var(--mut);font-size:10px;text-transform:uppercase;font-weight:800;padding:3px 4px}
.qe-tbl th.n{text-align:right}
.qe-tbl td{padding:2px 4px;border-bottom:1px solid #f0e7d9}
.qe-tbl td.n{text-align:right}
.qe-tbl td.x{width:26px;text-align:center}
.qe-tbl td.mono{font-variant-numeric:tabular-nums;color:var(--mut)}
.qe-tbl input{width:100%;border:1px solid var(--line);border-radius:6px;padding:5px 6px;font-size:12.5px;background:#fff;color:var(--ink);font-family:inherit}
.qe-tbl input.qn{text-align:right;font-variant-numeric:tabular-nums}
.qe-tbl input.qsm{width:56px}
.qe-tbl td.x button{border:0;background:none;color:#b3261e;cursor:pointer;font-size:12px}
.qe-none{color:var(--mut);font-style:italic;text-align:center;padding:6px}
.qe-ncrow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.qe-ncrow .qn{width:80px;border:1px solid var(--line);border-radius:6px;padding:6px;text-align:right;font-variant-numeric:tabular-nums;font-size:12.5px}
.qe-ncrow .qu{border:1px solid var(--line);border-radius:6px;padding:6px;font-size:12px;background:#fff;font-family:inherit}
.qe-ncrow .qx{color:var(--mut)}
.qe-ncrow .qeq{margin-left:auto;font-size:13px;color:var(--gr);font-variant-numeric:tabular-nums}
.qe-ncrow .qeq b{color:#177a42}
.qe-hh{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mut);margin-top:7px}
.qe-hh .qn{width:56px;border:1px solid var(--line);border-radius:6px;padding:5px;text-align:right;font-size:12.5px}
.qe-hh .qe-vt{margin-left:auto;font-weight:700;color:var(--pa2);font-variant-numeric:tabular-nums}
.qe-bar{position:sticky;bottom:0;background:linear-gradient(180deg,rgba(253,247,238,.9),#fdf7ee);backdrop-filter:blur(6px);border:1px solid #e6c8a8;border-radius:14px;padding:14px 16px;margin-top:14px;box-shadow:0 -3px 16px rgba(160,90,30,.1)}
.qe-bar-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px 22px;align-items:end}
.qe-bar-grid .k{display:block;font-size:10.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.3px}
.qe-bar-grid .v{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--ink)}
.qe-bar-grid .v.gr{color:var(--gr)}
.qe-bar-grid .big .v{font-size:23px;color:var(--pa2)}
.qe-bar-grid .mk .mkrow{display:flex;align-items:center;gap:4px;font-weight:800;color:var(--pa2)}
.qe-bar-grid .mkinp{width:58px;border:1px solid #e6c8a8;border-radius:8px;padding:5px 7px;font-size:16px;font-weight:800;text-align:right;color:var(--pa2)}
.qe-save{margin-top:12px;border:0;background:var(--pa);color:#fff;font-weight:800;font-size:14px;padding:11px 20px;border-radius:11px;cursor:pointer}
.qe-save:disabled{background:#d9c3ad;cursor:default}
.qe-msg{margin-top:9px;font-size:12.5px;color:var(--gr);font-weight:700}
.qe-msg.err{color:#b3261e}
`;
