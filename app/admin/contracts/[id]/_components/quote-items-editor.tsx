"use client";

import { useMemo, useState } from "react";
import {
  costNc,
  itemCost,
  thoSummary,
  DEFAULT_MARKUP_THO,
  type EDItem,
  type EDPart,
  type EstimateDetail,
} from "@/lib/estimate-detail";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `i${Date.now()}${Math.random()}`;

function blankItem(part: EDPart): EDItem {
  return {
    id: uid(),
    name: "Hạng mục mới",
    part,
    cols: [],
    rows: [],
    drawings: [],
    custSpec: [],
    cost: { nc: 0, ncQty: undefined, ncGia: undefined, ncUnit: "", materials: [], haoHutPct: 0 },
  };
}

const NC_UNITS = ["m³", "m²", "md", "kg", "viên", "gói", "bộ", "cái"];

// Editor hạng mục = 1 NGUỒN. Nhóm PHẦN THÔ / HOÀN THIỆN + đánh số (đồng bộ báo giá khách).
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

  const set = (id: string, patch: Partial<EDItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    touch();
  };
  const setCost = (id: string, patch: Partial<NonNullable<EDItem["cost"]>>) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, cost: { ...(it.cost ?? { nc: 0, materials: [], haoHutPct: 0 }), ...patch } } : it,
      ),
    );
    touch();
  };
  const addItem = (part: EDPart) => { setItems((p) => [...p, blankItem(part)]); touch(); };
  const delItem = (id: string, name: string) => {
    if (!confirm(`Xoá hạng mục "${name}"? Không hoàn tác được.`)) return;
    setItems((p) => p.filter((it) => it.id !== id));
    touch();
  };

  const detailNow: EstimateDetail = useMemo(() => ({ ...detail, items, markupTho: markup }), [detail, items, markup]);
  const s = thoSummary(detailNow, dtTong);

  async function save() {
    setSaving(true); setMsg(null);
    const r = await fetch(`/api/admin/design-contracts/${contractId}/estimate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, markupTho: markup }),
    });
    setSaving(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg("⚠ " + (d.message || "Lưu thất bại")); return;
    }
    setDirty(false);
    setMsg("✓ Đã lưu — đơn giá m² đã đẩy sang báo giá khách.");
    setTimeout(() => setMsg(null), 2600);
  }

  const tho = items.filter((it) => (it.part ?? "tho") === "tho");
  const ht = items.filter((it) => it.part === "ht");

  const card = (it: EDItem, n: number) => {
    const c = it.cost ?? { nc: 0, materials: [], haoHutPct: 0 };
    const nc = costNc(c);
    const cc = itemCost(c);
    return (
      <div className="qe-card" key={it.id}>
        <div className="qe-hd">
          <span className="qe-no">{n}</span>
          <input className="qe-nm" value={it.name} disabled={locked} placeholder="Tên hạng mục" onChange={(e) => set(it.id, { name: e.target.value })} />
          <input className="qe-tag" value={it.tag ?? ""} disabled={locked} placeholder="nhãn" onChange={(e) => set(it.id, { tag: e.target.value })} />
          <span className="qe-von">Vốn {fmt(cc.total)}đ</span>
          {!locked && <button type="button" className="qe-del" title="Xoá" onClick={() => delItem(it.id, it.name)}>✕</button>}
        </div>

        <div className="qe-body">
          {/* Chủng loại VT khách thấy */}
          <div className="qe-sub">
            <div className="qe-sub-h">
              <span>Chủng loại vật tư <em>(khách thấy)</em></span>
              {!locked && <button type="button" className="qe-mini" onClick={() => set(it.id, { custSpec: [...(it.custSpec ?? []), { ten: "", loai: "", quycach: "" }] })}>+ dòng</button>}
            </div>
            {(it.custSpec ?? []).length > 0 ? (
              <table className="qe-tbl">
                <thead><tr><th>Tên</th><th>Chủng loại</th><th>Quy cách</th><th /></tr></thead>
                <tbody>
                  {(it.custSpec ?? []).map((v, k) => (
                    <tr key={k}>
                      <td><input value={v.ten} disabled={locked} onChange={(e) => { const cs = [...(it.custSpec ?? [])]; cs[k] = { ...cs[k], ten: e.target.value }; set(it.id, { custSpec: cs }); }} /></td>
                      <td><input value={v.loai ?? ""} disabled={locked} onChange={(e) => { const cs = [...(it.custSpec ?? [])]; cs[k] = { ...cs[k], loai: e.target.value }; set(it.id, { custSpec: cs }); }} /></td>
                      <td><input value={v.quycach ?? ""} disabled={locked} onChange={(e) => { const cs = [...(it.custSpec ?? [])]; cs[k] = { ...cs[k], quycach: e.target.value }; set(it.id, { custSpec: cs }); }} /></td>
                      <td className="x">{!locked && <button type="button" onClick={() => set(it.id, { custSpec: (it.custSpec ?? []).filter((_, j) => j !== k) })}>✕</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="qe-none">chưa có chủng loại</div>}
          </div>

          {/* Giá vốn: NC khoán + Vật tư */}
          <div className="qe-sub">
            <div className="qe-sub-h"><span>Nhân công khoán <em>(khối lượng × đơn giá)</em></span></div>
            <div className="qe-ncrow">
              <input className="qn" type="number" value={c.ncQty ?? ""} disabled={locked} placeholder="KL" onChange={(e) => setCost(it.id, { ncQty: e.target.value === "" ? undefined : Number(e.target.value) })} />
              <select className="qu" value={c.ncUnit ?? ""} disabled={locked} onChange={(e) => setCost(it.id, { ncUnit: e.target.value })}>
                <option value="">đvt</option>
                {NC_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <span className="qx">×</span>
              <input className="qn wide" type="number" value={c.ncGia ?? ""} disabled={locked} placeholder="đơn giá NC" onChange={(e) => setCost(it.id, { ncGia: e.target.value === "" ? undefined : Number(e.target.value) })} />
              <span className="qeq">= <b>{fmt(nc)}</b> đ</span>
            </div>

            <div className="qe-sub-h mt"><span>Vật tư <em>(HG mua)</em></span>{!locked && <button type="button" className="qe-mini" onClick={() => setCost(it.id, { materials: [...(c.materials ?? []), { ten: "", dvt: "", kl: 0, gia: 0 }] })}>+ dòng</button>}</div>
            {(c.materials ?? []).length > 0 ? (
              <table className="qe-tbl">
                <thead><tr><th>Vật tư</th><th className="n">KL</th><th>ĐVT</th><th className="n">Đơn giá</th><th className="n">T.tiền</th><th /></tr></thead>
                <tbody>
                  {(c.materials ?? []).map((m, k) => (
                    <tr key={k}>
                      <td><input value={m.ten} disabled={locked} onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], ten: e.target.value }; setCost(it.id, { materials: ms }); }} /></td>
                      <td className="n"><input className="qn" type="number" value={m.kl || ""} disabled={locked} onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], kl: Number(e.target.value) || 0 }; setCost(it.id, { materials: ms }); }} /></td>
                      <td><input className="qsm" value={m.dvt} disabled={locked} onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], dvt: e.target.value }; setCost(it.id, { materials: ms }); }} /></td>
                      <td className="n"><input className="qn" type="number" value={m.gia || ""} disabled={locked} onChange={(e) => { const ms = [...(c.materials ?? [])]; ms[k] = { ...ms[k], gia: Number(e.target.value) || 0 }; setCost(it.id, { materials: ms }); }} /></td>
                      <td className="n mono">{fmt((Number(m.kl) || 0) * (Number(m.gia) || 0))}</td>
                      <td className="x">{!locked && <button type="button" onClick={() => setCost(it.id, { materials: (c.materials ?? []).filter((_, j) => j !== k) })}>✕</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="qe-none">chưa có vật tư</div>}
            <div className="qe-hh">
              Hao hụt VT <input className="qn sm" type="number" value={c.haoHutPct || ""} disabled={locked} onChange={(e) => setCost(it.id, { haoHutPct: Number(e.target.value) || 0 })} />%
              <span className="qe-vt">Vốn VT {fmt(cc.vt)}đ · Vốn NC {fmt(nc)}đ</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const section = (label: string, part: EDPart, list: EDItem[], addLabel: string) => (
    <div className="qe-sec">
      <div className="qe-sec-h">
        <h2>{label} <span className="qe-cnt">{list.length} hạng mục</span></h2>
        {!locked && <button type="button" className="qe-add" onClick={() => addItem(part)}>{addLabel}</button>}
      </div>
      {list.length === 0 && <div className="qe-secempty">Chưa có hạng mục — bấm “{addLabel}”.</div>}
      {list.map((it, i) => card(it, i + 1))}
    </div>
  );

  return (
    <div className="qe">
      {section("PHẦN THÔ", "tho", tho, "+ Thêm hạng mục thô")}
      {section("PHẦN HOÀN THIỆN", "ht", ht, "+ Thêm hạng mục hoàn thiện")}

      {/* Thanh tổng chảy ngược (phần thô) + Lưu */}
      <div className="qe-bar">
        <div className="qe-bar-t">Phần thô → đơn giá m² khách</div>
        <div className="qe-bar-grid">
          <div><span className="k">Vốn thô (VT+NC)</span><span className="v">{fmt(s.von)}</span></div>
          <div className="mk"><span className="k">% Lãi thô</span><span className="mkrow"><input type="number" min={0} max={200} value={Math.round(markup * 100)} disabled={locked} onChange={(e) => { setMarkup((Number(e.target.value) || 0) / 100); touch(); }} className="mkinp" />%</span></div>
          <div><span className="k">Lãi thô</span><span className="v gr">{fmt(s.lai)}</span></div>
          <div><span className="k">Tổng bán thô</span><span className="v">{fmt(s.ban)}</span></div>
          <div className="big"><span className="k">Đơn giá m² khách ({fmt(dtTong)} m² quy đổi)</span><span className="v">{fmt(s.donGiaM2)} đ/m²</span></div>
        </div>
        <div className="qe-bar-foot">
          {!locked && <button type="button" className="qe-save" onClick={save} disabled={saving || !dirty}>{saving ? "Đang lưu…" : dirty ? "💾 Lưu + đẩy sang khách" : "✓ Đã lưu"}</button>}
          {msg && <span className={`qe-msg${msg.startsWith("⚠") ? " err" : ""}`}>{msg}</span>}
          {dtTong <= 0 && <span className="qe-msg err">⚠ Chưa có diện tích quy đổi (báo giá khách) → chưa ra đơn giá m².</span>}
          {locked && <span className="qe-msg">HĐ đã chuyển thi công — chỉ xem.</span>}
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.qe{--orange:#cf5a12;--brown:#974706;--browntx:#7a3b08;--ink:#241d18;--mute:#8a7c6f;--line:#eee2d3;--soft:#faf3ea;--titlebg:#fbeada;--green:#1f8a4c;--red:#b3261e;color:var(--ink);padding-bottom:150px}
.qe-sec{margin-bottom:26px}
.qe-sec-h{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.qe-sec-h h2{margin:0;font-size:16px;font-weight:800;color:var(--brown);letter-spacing:.3px}
.qe-cnt{font-size:12px;font-weight:600;color:var(--mute);margin-left:6px}
.qe-add{border:1px solid var(--orange);background:var(--orange);color:#fff;font-weight:700;font-size:13px;padding:8px 15px;border-radius:999px;cursor:pointer}
.qe-add:hover{background:var(--brown);border-color:var(--brown)}
.qe-secempty{padding:14px;color:var(--mute);font-style:italic;background:var(--soft);border:1px dashed var(--line);border-radius:12px}
.qe-card{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 2px 9px rgba(60,40,20,.04);margin-bottom:14px}
.qe-hd{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:10px 13px;background:var(--titlebg);border-bottom:1px solid var(--line)}
.qe-no{flex-shrink:0;width:26px;height:26px;border-radius:50%;background:var(--brown);color:#fff;font-weight:800;font-size:13px;display:grid;place-items:center}
.qe-nm{flex:1;min-width:150px;border:1px solid #e6cdae;border-radius:9px;padding:8px 11px;font-size:15px;font-weight:700;color:var(--ink);background:#fff}
.qe-tag{width:110px;border:1px solid #e6cdae;border-radius:9px;padding:8px 10px;font-size:12.5px;color:var(--mute);background:#fff}
.qe-von{font-weight:800;color:var(--brown);font-variant-numeric:tabular-nums;font-size:13.5px;white-space:nowrap;margin-left:auto}
.qe-del{border:1px solid #f0cfc9;background:var(--red);color:#fff;border-radius:8px;width:30px;height:30px;font-weight:800;cursor:pointer}
.qe-body{padding:13px;display:grid;grid-template-columns:1fr 1.25fr;gap:13px}
@media(max-width:880px){.qe-body{grid-template-columns:1fr}}
.qe-sub{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.qe-sub-h{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--browntx);margin-bottom:7px}
.qe-sub-h.mt{margin-top:12px}
.qe-sub-h em{font-style:normal;font-weight:600;color:var(--mute);text-transform:none;letter-spacing:0}
.qe-mini{border:1px solid var(--orange);background:#fff;color:var(--orange);border-radius:999px;padding:3px 11px;font-size:11.5px;font-weight:700;cursor:pointer}
.qe-none{color:var(--mute);font-style:italic;font-size:12.5px;padding:3px 2px}
.qe-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.qe-tbl th{text-align:left;color:var(--mute);font-size:10px;text-transform:uppercase;font-weight:800;padding:3px 5px;letter-spacing:.3px}
.qe-tbl th.n{text-align:right}
.qe-tbl td{padding:3px 5px;border-bottom:1px solid var(--line)}
.qe-tbl tr:last-child td{border-bottom:0}
.qe-tbl td.n{text-align:right}
.qe-tbl td.x{width:26px;text-align:center}
.qe-tbl td.mono{font-variant-numeric:tabular-nums;color:var(--mute)}
.qe-tbl input{width:100%;border:1px solid var(--line);border-radius:7px;padding:6px 7px;font-size:12.5px;background:#fff;color:var(--ink);font-family:inherit}
.qe-tbl input:focus{outline:0;border-color:var(--orange)}
.qe-tbl input.qn{text-align:right;font-variant-numeric:tabular-nums}
.qe-tbl input.qsm{width:54px}
.qe-tbl td.x button{border:0;background:none;color:var(--red);cursor:pointer;font-size:12px}
.qe-ncrow{display:flex;align-items:center;gap:7px;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:9px;padding:8px 10px}
.qe-ncrow .qn{width:78px;border:1px solid var(--line);border-radius:7px;padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;font-size:13px}
.qe-ncrow .qn.wide{width:112px}
.qe-ncrow .qu{border:1px solid var(--line);border-radius:7px;padding:6px 7px;font-size:12px;background:#fff;font-family:inherit}
.qe-ncrow .qx{color:var(--mute);font-weight:700}
.qe-ncrow .qeq{margin-left:auto;font-size:13px;color:var(--green);font-variant-numeric:tabular-nums;white-space:nowrap}
.qe-ncrow .qeq b{color:#177a42;font-size:14px}
.qe-hh{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mute);margin-top:8px}
.qe-hh .qn.sm{width:52px;border:1px solid var(--line);border-radius:7px;padding:5px 6px;text-align:right;font-size:12.5px}
.qe-hh .qe-vt{margin-left:auto;font-weight:700;color:var(--brown);font-variant-numeric:tabular-nums}
.qe-bar{position:sticky;bottom:0;background:rgba(251,234,218,.96);backdrop-filter:blur(8px);border:1px solid #e6cdae;border-radius:16px;padding:13px 16px;margin-top:8px;box-shadow:0 -4px 18px rgba(120,70,20,.12)}
.qe-bar-t{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--browntx);margin-bottom:9px}
.qe-bar-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:11px 22px;align-items:end}
.qe-bar-grid .k{display:block;font-size:10.5px;color:var(--mute);text-transform:uppercase;letter-spacing:.3px}
.qe-bar-grid .v{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--ink)}
.qe-bar-grid .v.gr{color:var(--green)}
.qe-bar-grid .big .v{font-size:23px;color:var(--brown)}
.qe-bar-grid .mk .mkrow{display:flex;align-items:center;gap:3px;font-weight:800;color:var(--brown)}
.qe-bar-grid .mkinp{width:56px;border:1px solid #e6cdae;border-radius:8px;padding:5px 7px;font-size:16px;font-weight:800;text-align:right;color:var(--brown);background:#fff}
.qe-bar-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:11px}
.qe-save{border:0;background:var(--orange);color:#fff;font-weight:800;font-size:14px;padding:11px 20px;border-radius:11px;cursor:pointer}
.qe-save:hover{background:var(--brown)}
.qe-save:disabled{background:#dcc6b0;cursor:default}
.qe-msg{font-size:12.5px;color:var(--green);font-weight:700}
.qe-msg.err{color:var(--red)}
`;
