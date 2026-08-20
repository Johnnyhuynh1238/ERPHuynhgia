"use client";

import { useEffect, useMemo, useState } from "react";
import {
  costNc,
  itemCost,
  thoSummary,
  hangMucAnchor,
  DEFAULT_MARKUP_THO,
  type EDItem,
  type EDPart,
  type EstimateDetail,
} from "@/lib/estimate-detail";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const norm = (s: string) => (s || "").trim().toLowerCase();
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `i${Date.now()}${Math.random()}`;
const NC_UNITS = ["m³", "m²", "md", "kg", "viên", "gói", "bộ", "cái"];

// Tiền (nguyên) — hiện phân cách ngàn, nhập bỏ dấu chấm.
const money = (n: number | undefined | null) => (n || n === 0 ? Number(n).toLocaleString("vi-VN") : "");
const parseMoney = (s: string) => { const d = s.replace(/[^\d]/g, ""); return d === "" ? undefined : Number(d); };
// KL (có thể lẻ) — hiện dấu phẩy thập phân VN, nhập nhận cả , và .
const klShow = (n: number | undefined | null) => (n || n === 0 ? String(n).replace(".", ",") : "");
const parseKl = (s: string) => { const t = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""); return t === "" ? undefined : Number(t); };

// Giá vốn — GỘP theo hạng mục. Mặc định XEM; bấm "Sửa" mới hiện ô nhập.
export function QuoteItemsEditor({
  contractId,
  detail,
  dtTong,
  hmTho,
  hmHt,
  locked,
  scrollTarget,
  scrollNonce,
}: {
  contractId: string;
  detail: EstimateDetail;
  dtTong: number;
  hmTho: string[];
  hmHt: string[];
  locked?: boolean;
  scrollTarget?: string | null;
  scrollNonce?: number;
}) {
  const [items, setItems] = useState<EDItem[]>(() =>
    (detail?.items ?? []).map((it) => ({ ...it, cost: it.cost ? { ...it.cost } : { nc: 0, materials: [], haoHutPct: 0 } })),
  );
  const [markup, setMarkup] = useState<number>(detail?.markupTho ?? DEFAULT_MARKUP_THO);
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const touch = () => { if (!dirty) setDirty(true); setMsg(null); };

  useEffect(() => {
    if (!scrollTarget) return;
    const anchor = hangMucAnchor(scrollTarget);
    let cancelled = false;
    const doScroll = () => {
      if (cancelled) return;
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    doScroll();
    const timers = [120, 350, 700, 1200, 2000, 3000].map((ms) => setTimeout(doScroll, ms));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [scrollTarget, scrollNonce]);

  const set = (id: string, patch: Partial<EDItem>) => { setItems((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it))); touch(); };
  const setCost = (id: string, patch: Partial<NonNullable<EDItem["cost"]>>) => {
    setItems((p) => p.map((it) => (it.id === id ? { ...it, cost: { ...(it.cost ?? { nc: 0, materials: [], haoHutPct: 0 }), ...patch } } : it)));
    touch();
  };
  const addCong = (hangMuc: string, part: EDPart) => {
    setItems((p) => [...p, { id: uid(), name: "Công tác mới", part, hangMuc, cols: [], rows: [], drawings: [], cost: { nc: 0, materials: [], haoHutPct: 0 } }]);
    touch();
  };
  const delCong = (id: string, name: string) => {
    if (!confirm(`Xoá công tác "${name}"? Không hoàn tác được.`)) return;
    setItems((p) => p.filter((it) => it.id !== id)); touch();
  };

  const detailNow: EstimateDetail = useMemo(() => ({ ...detail, items, markupTho: markup }), [detail, items, markup]);
  const s = thoSummary(detailNow, dtTong);

  async function save() {
    setSaving(true); setMsg(null);
    const r = await fetch(`/api/admin/design-contracts/${contractId}/estimate`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, markupTho: markup }),
    });
    setSaving(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg("⚠ " + (d.message || "Lưu thất bại")); return; }
    setDirty(false); setEdit(false); setMsg("✓ Đã lưu — đơn giá m² đã đẩy sang báo giá khách.");
    setTimeout(() => setMsg(null), 2600);
  }

  const congCard = (it: EDItem) => {
    const c = it.cost ?? { nc: 0, materials: [], haoHutPct: 0 };
    const cc = itemCost(c);
    const nc = costNc(c);
    return (
      <div className="ct" key={it.id}>
        <div className="ct-top">
          {edit
            ? <input className="ct-nm ed" value={it.name} placeholder="Tên công tác" onChange={(e) => set(it.id, { name: e.target.value })} />
            : <span className="ct-nm">{it.name}</span>}
          <span className="ct-von">{fmt(cc.total)}đ</span>
          {edit && <button type="button" className="ct-del" title="Xoá công tác" onClick={() => delCong(it.id, it.name)}>✕</button>}
        </div>
        <div className="grid2">
          <div className="box">
            <div className="box-h">Nhân công khoán</div>
            {edit ? (
              <div className="nc">
                <input className="c qn" inputMode="decimal" value={klShow(c.ncQty)} placeholder="KL" onChange={(e) => setCost(it.id, { ncQty: parseKl(e.target.value) })} />
                <select className="c" value={c.ncUnit ?? ""} onChange={(e) => setCost(it.id, { ncUnit: e.target.value })}>
                  <option value="">đvt</option>{NC_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <span className="x">×</span>
                <input className="c qn wide" inputMode="numeric" value={money(c.ncGia)} placeholder="đơn giá" onChange={(e) => setCost(it.id, { ncGia: parseMoney(e.target.value) })} />
                <span className="eq">= <b>{fmt(nc)}</b></span>
              </div>
            ) : (
              <div className="nc view">
                {c.ncQty != null && c.ncGia != null
                  ? <span>{klShow(c.ncQty)} {c.ncUnit} × {money(c.ncGia)}</span>
                  : <span className="mut">khoán gói</span>}
                <span className="eq">= <b>{fmt(nc)}</b> đ</span>
              </div>
            )}
          </div>
          <div className="box">
            <div className="box-h">Vật tư (HG mua){edit && <button type="button" className="mini" onClick={() => setCost(it.id, { materials: [...(c.materials ?? []), { ten: "", dvt: "", kl: 0, gia: 0 }] })}>+ dòng</button>}</div>
            {(c.materials ?? []).length > 0 ? (
              <table>
                <tbody>
                  {(c.materials ?? []).map((m, k) => (
                    <tr key={k}>
                      {edit ? <>
                        <td><input value={m.ten} placeholder="vật tư" onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], ten: e.target.value }; setCost(it.id, { materials: ms }); }} /></td>
                        <td className="n"><input className="qn" inputMode="decimal" value={klShow(m.kl)} onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], kl: parseKl(e.target.value) ?? 0 }; setCost(it.id, { materials: ms }); }} /></td>
                        <td><input className="qsm" value={m.dvt} placeholder="đvt" onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], dvt: e.target.value }; setCost(it.id, { materials: ms }); }} /></td>
                        <td className="n"><input className="qn" inputMode="numeric" value={money(m.gia)} onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], gia: parseMoney(e.target.value) ?? 0 }; setCost(it.id, { materials: ms }); }} /></td>
                        <td className="n mono">{fmt((Number(m.kl) || 0) * (Number(m.gia) || 0))}</td>
                        <td className="x2"><button type="button" onClick={() => setCost(it.id, { materials: (c.materials ?? []).filter((_, j) => j !== k) })}>✕</button></td>
                      </> : <>
                        <td>{m.ten}</td>
                        <td className="n">{klShow(m.kl)} {m.dvt}</td>
                        <td className="n">{money(m.gia)}</td>
                        <td className="n mono">{fmt((Number(m.kl) || 0) * (Number(m.gia) || 0))}</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="none">— không có vật tư —</div>}
            <div className="hh">
              Hao hụt {edit ? <input className="qn sm" inputMode="numeric" value={c.haoHutPct || ""} onChange={(e) => setCost(it.id, { haoHutPct: Number(e.target.value) || 0 })} /> : <b>{c.haoHutPct || 0}</b>}% · Vốn VT {fmt(cc.vt)}đ
            </div>
          </div>
        </div>
      </div>
    );
  };

  const section = (names: string[], part: EDPart) =>
    names.map((name, i) => {
      const cong = items.filter((it) => norm(it.hangMuc || "") === norm(name));
      const von = cong.reduce((a, it) => a + itemCost(it.cost).total, 0);
      return (
        <div className="hm" id={hangMucAnchor(name)} key={name}>
          <div className="hm-hd"><span className="hm-no">{i + 1}</span><span className="hm-nm">{name}</span><span className="hm-von">Vốn {fmt(von)}đ</span></div>
          <div className="hm-bd">
            {cong.map(congCard)}
            {cong.length === 0 && <div className="hm-empty">Chưa có công tác.</div>}
            {edit && <button type="button" className="addct" onClick={() => addCong(name, part)}>+ Thêm công tác</button>}
          </div>
        </div>
      );
    });

  return (
    <div className="ge">
      <div className="ge-topbar">
        <span className="ge-lead">Giá vốn theo hạng mục — Nhân công khoán (KL×đơn giá) + Vật tư.</span>
        {!locked && (
          edit
            ? <button type="button" className="ge-editbtn on" onClick={() => setEdit(false)}>✓ Xong xem</button>
            : <button type="button" className="ge-editbtn" onClick={() => setEdit(true)}>✏️ Sửa</button>
        )}
      </div>

      {hmTho.length > 0 && <div className="ge-part">PHẦN THÔ</div>}
      {section(hmTho, "tho")}
      {hmHt.length > 0 && <div className="ge-part">PHẦN HOÀN THIỆN</div>}
      {section(hmHt, "ht")}

      <div className="ge-bar">
        <div className="ge-bar-t">Phần thô → đơn giá m² khách</div>
        <div className="ge-bg">
          <div><span className="k">Vốn thô (VT+NC)</span><span className="v">{fmt(s.von)}</span></div>
          <div className="mk"><span className="k">% Lãi thô</span>
            {edit
              ? <span className="mkrow"><input inputMode="numeric" value={Math.round(markup * 100)} onChange={(e) => { setMarkup((Number(String(e.target.value).replace(/[^\d]/g, "")) || 0) / 100); touch(); }} className="mkinp" />%</span>
              : <span className="v mk2">{Math.round(markup * 100)}%</span>}
          </div>
          <div><span className="k">Lãi thô</span><span className="v gr">{fmt(s.lai)}</span></div>
          <div><span className="k">Tổng bán thô</span><span className="v">{fmt(s.ban)}</span></div>
          <div className="big"><span className="k">Đơn giá m² khách ({fmt(dtTong)} m²)</span><span className="v">{fmt(s.donGiaM2)} đ/m²</span></div>
          {edit && <button type="button" className="save" onClick={save} disabled={saving || !dirty}>{saving ? "…" : dirty ? "💾 Lưu" : "✓ Đã lưu"}</button>}
        </div>
        {msg && <div className={`ge-msg${msg.startsWith("⚠") ? " err" : ""}`}>{msg}</div>}
        {dtTong <= 0 && <div className="ge-msg err">⚠ Chưa có diện tích quy đổi (báo giá khách) → chưa ra đơn giá m².</div>}
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.ge{--orange:#cf5a12;--brown:#974706;--browntx:#7a3b08;--ink:#241d18;--mute:#8a7c6f;--line:#eee2d3;--soft:#faf3ea;--titlebg:#fbeada;--green:#1f8a4c;--red:#b3261e;color:var(--ink);padding-bottom:130px;color-scheme:light}
.ge input,.ge select,.ge textarea{background:#fff;color:var(--ink);-webkit-text-fill-color:var(--ink)}
.ge input::placeholder{color:#b7a894}
.ge-topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 16px}
.ge-lead{font-size:13px;color:var(--mute)}
.ge-editbtn{border:1px solid var(--orange);background:#fff;color:var(--orange);font-weight:800;font-size:13px;padding:8px 16px;border-radius:999px;cursor:pointer}
.ge-editbtn.on{background:var(--orange);color:#fff}
.ge-part{font-size:13px;font-weight:800;color:var(--brown);letter-spacing:.4px;margin:18px 0 10px}
.ge-part:first-of-type{margin-top:0}
.hm{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 3px 12px rgba(60,40,20,.05);margin-bottom:16px;scroll-margin-top:72px}
.hm-hd{display:flex;align-items:center;gap:11px;padding:12px 16px;background:linear-gradient(180deg,#fdf1e0,var(--titlebg));border-bottom:1px solid #efd9bd}
.hm-no{width:27px;height:27px;border-radius:50%;background:var(--brown);color:#fff;font-weight:800;font-size:13px;display:grid;place-items:center;flex-shrink:0}
.hm-nm{font-size:15px;font-weight:800;color:var(--ink)}
.hm-von{margin-left:auto;font-weight:800;color:var(--brown);font-size:14px;font-variant-numeric:tabular-nums}
.hm-bd{padding:6px 16px 14px}
.hm-empty{color:var(--mute);font-style:italic;font-size:12.5px;padding:8px 0}
.addct{margin-top:8px;border:1px dashed var(--orange);background:#fff;color:var(--orange);border-radius:9px;padding:7px 14px;font-size:12.5px;font-weight:700;cursor:pointer}
.ct{border-bottom:1px solid var(--line);padding:11px 0}
.ct:last-of-type{border-bottom:0}
.ct-top{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.ct-nm{flex:1;min-width:150px;font-weight:700;font-size:13.5px}
.ct-nm.ed{border:1px solid var(--line);border-radius:8px;padding:6px 9px}
.ct-von{font-weight:700;color:var(--brown);font-variant-numeric:tabular-nums;font-size:13px}
.ct-del{border:1px solid #f0cfc9;background:#fdf0ee;color:var(--red);border-radius:7px;width:26px;height:26px;font-weight:800;cursor:pointer}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:820px){.grid2{grid-template-columns:1fr}}
.box{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:8px 11px}
.box-h{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--browntx);margin-bottom:6px}
.mini{border:1px solid var(--orange);background:#fff;color:var(--orange);border-radius:999px;padding:2px 9px;font-size:10.5px;font-weight:700;float:right;cursor:pointer}
.nc{display:flex;align-items:center;gap:6px;font-size:13px;flex-wrap:wrap}
.nc.view{color:#5c4c3d}
.nc.view .mut{color:var(--mute);font-style:italic}
.nc .c{border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:12.5px;font-family:inherit}
.nc .qn{width:66px;text-align:right;font-variant-numeric:tabular-nums}
.nc .qn.wide{width:104px}
.nc .x{color:var(--mute)}
.nc .eq{margin-left:auto;color:var(--green);font-variant-numeric:tabular-nums;white-space:nowrap}
.nc .eq b{color:#177a42}
.box table{width:100%;border-collapse:collapse;font-size:12px}
.box td{padding:2px 3px;border-bottom:1px solid var(--line);vertical-align:middle}
.box tr:last-child td{border-bottom:0}
.box td.n{text-align:right;font-variant-numeric:tabular-nums}
.box td.mono{color:var(--mute);font-variant-numeric:tabular-nums}
.box td.x2{width:22px;text-align:center}
.box td.x2 button{border:0;background:none;color:var(--red);cursor:pointer}
.box input{width:100%;border:1px solid var(--line);border-radius:6px;padding:4px 6px;font-size:12px;font-family:inherit}
.box input:focus{outline:0;border-color:var(--orange)}
.box input.qn{text-align:right;font-variant-numeric:tabular-nums;width:74px}
.box input.qsm{width:46px}
.box .none{color:var(--mute);font-style:italic;font-size:12px;padding:3px 0}
.hh{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--mute);margin-top:7px}
.hh b{color:var(--brown)}
.hh .qn.sm{width:46px;border:1px solid var(--line);border-radius:6px;padding:4px;text-align:right;font-size:12px}
.ge-bar{position:sticky;bottom:0;background:rgba(251,234,218,.97);backdrop-filter:blur(8px);border:1px solid #e6cdae;border-radius:16px;padding:13px 16px;margin-top:10px;box-shadow:0 -4px 18px rgba(120,70,20,.12)}
.ge-bar-t{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--browntx);margin-bottom:10px}
.ge-bg{display:grid;grid-template-columns:repeat(5,1fr) auto;gap:11px 20px;align-items:end}
@media(max-width:820px){.ge-bg{grid-template-columns:repeat(2,1fr)}}
.ge-bg .k{display:block;font-size:10px;color:var(--mute);text-transform:uppercase;margin-bottom:3px}
.ge-bg .v{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}
.ge-bg .v.gr{color:var(--green)}
.ge-bg .v.mk2{color:var(--brown)}
.ge-bg .mk .mkrow{display:flex;align-items:center;gap:3px;font-weight:800;color:var(--brown)}
.ge-bg .mkinp{width:56px;border:1px solid #e6cdae;border-radius:8px;padding:5px 7px;font-size:16px;font-weight:800;text-align:right;color:var(--brown)}
.ge-bg .big .v{font-size:24px;color:var(--brown)}
.ge-bg .save{border:0;background:var(--orange);color:#fff;font-weight:800;font-size:14px;padding:10px 18px;border-radius:11px;cursor:pointer;align-self:center}
.ge-bg .save:disabled{background:#dcc6b0;cursor:default}
.ge-msg{margin-top:9px;font-size:12.5px;color:var(--green);font-weight:700}
.ge-msg.err{color:var(--red)}
`;
