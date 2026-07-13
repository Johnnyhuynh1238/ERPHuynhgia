"use client";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./mua-hang.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

// ── kiểu dữ liệu ──────────────────────────────────────────────
type Material = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  taskCode: string | null; // "07-030"
  taskName: string | null;
};
type CatalogTask = { phaseCode: string; phaseName: string };

type OrderItem = { key: string; name: string; unit: string; qty: number; price: number };
type Order = {
  id: string;
  seq: number;
  status: "draft" | "ordered" | "received" | "paid";
  supplierName: string | null;
  orderDate: string;
  deliveryDate: string | null;
  note: string | null;
  total: number;
  items: OrderItem[];
};

type Group = {
  key: string;
  name: string;
  unit: string;
  lines: Material[];
  total: number; // Σ SL dự toán
  amount: number; // Σ SL*đơn giá
  uprice: number; // đơn giá bình quân
  minph: string; // giai đoạn nhỏ nhất
};

const STATUS: { k: Order["status"]; l: string }[] = [
  { k: "draft", l: "Nháp" },
  { k: "ordered", l: "Đã đặt NCC" },
  { k: "received", l: "Đã nhận" },
  { k: "paid", l: "Đã thanh toán" },
];
const stLabel = (k: string) => STATUS.find((s) => s.k === k)?.l || "Đã đặt NCC";

const fmt = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");
const fmtQ = (n: number) =>
  Math.abs(n - Math.round(n)) < 1e-9
    ? Math.round(n).toLocaleString("vi-VN")
    : n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
const baseName = (n: string) => {
  const i = n.indexOf(" (");
  return (i >= 0 ? n.slice(0, i) : n).trim();
};
const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${`0${d.getDate()}`.slice(-2)}/${`0${d.getMonth() + 1}`.slice(-2)}/${d.getFullYear()}`;
};
const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function MuaHangClient({
  projectId,
  projectCode,
  projectName,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [phaseNames, setPhaseNames] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"buy" | "orders">("buy");
  const [pending, setPending] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Order | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const saved = localStorage.getItem("muahang-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);
  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("muahang-theme", next);
      return next;
    });

  const toast = (m: string) => {
    setToastMsg(m);
    window.setTimeout(() => setToastMsg(null), 2600);
  };

  const loadOrders = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/mua-hang`, { cache: "no-store" });
    const j = await r.json();
    setOrders(Array.isArray(j.items) ? j.items : []);
  }, [projectId]);

  useEffect(() => {
    (async () => {
      try {
        const [mRes, metaRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/estimate-db/materials`, { cache: "no-store" }),
          fetch(`/api/projects/${projectId}/estimate-db/meta`, { cache: "no-store" }),
        ]);
        if (!mRes.ok) throw new Error("Không đọc được vật tư dự toán");
        const mj = await mRes.json();
        setMaterials(mj.items || []);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          const pn: Record<string, string> = {};
          (meta.tasks as CatalogTask[])?.forEach((t) => {
            if (t.phaseCode) pn[t.phaseCode] = t.phaseName;
          });
          setPhaseNames(pn);
        }
        await loadOrders();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, loadOrders]);

  // ── gộp VT theo tên gốc + đơn vị ──────────────────────────
  const groups = useMemo<Group[]>(() => {
    const map: Record<string, Group> = {};
    const out: Group[] = [];
    for (const m of materials) {
      const ph = (m.taskCode || "").split("-")[0] || "99";
      const b = baseName(m.name);
      const key = `${b}|${m.unit}`;
      if (!map[key]) {
        map[key] = { key, name: b, unit: m.unit, lines: [], total: 0, amount: 0, uprice: 0, minph: ph };
        out.push(map[key]);
      }
      const g = map[key];
      g.lines.push(m);
      g.total += m.quantity;
      g.amount += m.quantity * m.unitPrice;
      if (ph < g.minph) g.minph = ph;
    }
    out.forEach((g) => (g.uprice = g.total > 0 ? g.amount / g.total : 0));
    out.sort((a, b) => (a.minph !== b.minph ? (a.minph < b.minph ? -1 : 1) : b.amount - a.amount));
    return out;
  }, [materials]);

  const placed = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    orders.forEach((o) => o.items.forEach((it) => (m[it.key] = (m[it.key] || 0) + it.qty)));
    return m;
  }, [orders]);

  const setQty = (key: string, v: string) => {
    const n = parseFloat(v);
    setPending((p) => ({ ...p, [key]: !isNaN(n) && n > 0 ? n : 0 }));
  };

  const cart = useMemo(() => {
    let cnt = 0;
    let sum = 0;
    groups.forEach((g) => {
      const q = pending[g.key] || 0;
      if (q > 0) {
        cnt++;
        sum += q * g.uprice;
      }
    });
    return { cnt, sum };
  }, [groups, pending]);

  const summary = useMemo(() => {
    let tot = 0;
    let pl = 0;
    groups.forEach((g) => {
      tot += g.amount;
      pl += (placed[g.key] || 0) * g.uprice;
    });
    return { tot, pl, remain: tot - pl, pct: tot > 0 ? Math.round((pl / tot) * 100) : 0 };
  }, [groups, placed]);

  const createOrder = async () => {
    const items: OrderItem[] = [];
    groups.forEach((g) => {
      const q = pending[g.key] || 0;
      if (q > 0) items.push({ key: g.key, name: g.name, unit: g.unit, qty: q, price: Math.round(g.uprice) });
    });
    if (!items.length) return;
    const r = await fetch(`/api/projects/${projectId}/mua-hang`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const j = await r.json();
    if (!r.ok) {
      toast(j.message || "Tạo đơn lỗi");
      return;
    }
    setPending({});
    await loadOrders();
    toast(`Đã tạo đơn #${j.seq} · ${items.length} vật tư`);
  };

  const delOrder = async (o: Order) => {
    if (!window.confirm(`Xoá đơn #${o.seq}? Số đã đặt sẽ trừ lại.`)) return;
    const r = await fetch(`/api/projects/${projectId}/mua-hang/${o.id}`, { method: "DELETE" });
    if (r.ok) {
      await loadOrders();
      toast(`Đã xoá đơn #${o.seq}`);
    }
  };

  const downloadPO = (o: Order) => {
    const rows = o.items
      .map(
        (it, i) =>
          `<tr><td class="c">${i + 1}</td><td>${esc(it.name)}</td><td class="c">${esc(it.unit)}</td><td class="r">${fmtQ(
            it.qty,
          )}</td><td class="r">${fmt(it.price)}</td><td class="r">${fmt(it.qty * it.price)}</td></tr>`,
      )
      .join("");
    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>PO don #${o.seq}</title><style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:"Times New Roman",serif;color:#111;font-size:13px;line-height:1.45;margin:0}
.h{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px}
.co b{font-size:17px;letter-spacing:.5px}.co div{font-size:11px;color:#444}
.t{text-align:center;margin:18px 0 4px}.t h1{font-size:19px;margin:0;letter-spacing:1px}.t .s{font-size:11px;color:#555;letter-spacing:2px;text-transform:uppercase}
.meta{display:flex;justify-content:space-between;margin:14px 0;font-size:12.5px}.meta div{line-height:1.7}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #999;padding:6px 8px}th{background:#f0ece2;font-size:11px;text-transform:uppercase;letter-spacing:.3px}
td.c,th.c{text-align:center}td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:bold;background:#faf8f2}
.note{margin-top:12px;font-size:12px}.sign{display:flex;justify-content:space-between;margin-top:34px;text-align:center;font-size:12px}
.sign div{width:45%}.sign .role{font-weight:bold}.sign .sp{height:60px}
.pf{position:fixed;bottom:8mm;right:16mm;font-size:10px;color:#888}@media print{.noprint{display:none}}
.pbtn{position:fixed;top:12px;right:12px;background:#E36122;color:#fff;border:none;border-radius:8px;padding:10px 18px;font:600 14px sans-serif;cursor:pointer}
</style></head><body>
<button class="pbtn noprint" onclick="window.print()">In / Lưu PDF</button>
<div class="h"><div class="co"><b>CÔNG TY XÂY DỰNG HUỲNH GIA</b><div>ERP · erp.huynhgia6.com</div></div>
<div style="text-align:right;font-size:11px;color:#444">Đúng — Đẹp — Bền</div></div>
<div class="t"><h1>ĐƠN ĐẶT HÀNG</h1><div class="s">Purchase Order</div></div>
<div class="meta"><div><b>Công trình:</b> ${esc(projectName)}<br><b>Mã dự án:</b> ${esc(projectCode)}<br><b>NCC:</b> ${esc(
      o.supplierName || "..............................",
    )}</div>
<div style="text-align:right"><b>Số PO:</b> #${o.seq}<br><b>Ngày đặt:</b> ${fmtDate(o.orderDate)}<br><b>Ngày nhận:</b> ${
      fmtDate(o.deliveryDate) || "................"
    }<br><b>Trạng thái:</b> ${stLabel(o.status)}</div></div>
<table><thead><tr><th class="c">STT</th><th>Vật tư</th><th class="c">ĐVT</th><th class="r">SL</th><th class="r">Đơn giá</th><th class="r">Thành tiền</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="5" class="r">TỔNG CỘNG</td><td class="r">${fmt(o.total)}</td></tr></tfoot></table>
${o.note ? `<div class="note"><b>Ghi chú:</b> ${esc(o.note)}</div>` : ""}
<div class="sign"><div><div class="role">NHÀ CUNG CẤP</div><div class="sp"></div>(Ký, ghi rõ họ tên)</div>
<div><div class="role">ĐẠI DIỆN HUỲNH GIA</div><div class="sp"></div>(Ký, ghi rõ họ tên)</div></div>
<div class="pf">In từ ERP Huỳnh Gia · ${fmtDate(new Date().toISOString())}</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  const cartOn = tab === "buy" && cart.cnt > 0;

  return (
    <div className={`mhdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="wrap">
        {/* topbar */}
        <div className="topbar">
          <div className="brand">
            <div className="mark">H6</div>
            <div>
              <b>HUỲNH GIA</b>
              <span>Mua hàng</span>
            </div>
          </div>
          <div className="topacts">
            <Link href={`/projects/${projectId}`} className="mhback">
              ← Dự án
            </Link>
            <button type="button" className="iconbtn ai" onClick={() => setAiOpen(true)} title="AI quản lý đơn hàng">
              🤖
            </button>
            <button type="button" className="iconbtn" onClick={toggleTheme} aria-label="Sáng/tối">
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </div>

        <div className="eyebrow">Đặt mua vật tư · {projectCode}</div>
        <h1>{projectName}</h1>
        <div className="meta">
          <span>
            {loading ? "…" : groups.length} chủng loại
          </span>
          <span className="d">·</span>
          <span>Bám dự toán</span>
        </div>

        {/* summary */}
        <div className="sum">
          <div className="c">
            <div className="k">Dự toán VT</div>
            <div className="v t num">{loading ? "—" : fmt(summary.tot)}</div>
            <div className="sp">{loading ? "—" : `${groups.length} chủng loại`}</div>
          </div>
          <div className="c">
            <div className="k">Đã đặt</div>
            <div className="v o num">{loading ? "—" : fmt(summary.pl)}</div>
            <div className="sp">{loading ? "—" : `${summary.pct}% dự toán`}</div>
          </div>
          <div className="c">
            <div className="k">Còn lại</div>
            <div className="v g num">{loading ? "—" : fmt(summary.remain)}</div>
            <div className="sp">so dự toán</div>
          </div>
        </div>

        {/* tabs */}
        <div className="tabs">
          <button type="button" className={`tab${tab === "buy" ? " on" : ""}`} onClick={() => setTab("buy")}>
            <span>Mua hàng</span>
          </button>
          <button type="button" className={`tab${tab === "orders" ? " on" : ""}`} onClick={() => setTab("orders")}>
            <span>Đơn đã tạo</span>
            <span className="cnt">{orders.length}</span>
          </button>
        </div>

        <div className="panel">
          {loading ? (
            <div className="load">Đang tải dự toán…</div>
          ) : err ? (
            <div className="empty">{err}</div>
          ) : tab === "buy" ? (
            <>
              <BuyList
                groups={groups}
                phaseNames={phaseNames}
                placed={placed}
                pending={pending}
                open={open}
                setOpen={setOpen}
                setQty={setQty}
              />
              <div className="foot">Nhập SL cần mua → Tạo đơn · Đúng — Đẹp — Bền</div>
            </>
          ) : (
            <OrdersList orders={orders} onEdit={setEditing} onDel={delOrder} onPO={downloadPO} />
          )}
        </div>
      </div>

      {/* cart nổi */}
      <div className={`cart${cartOn ? " show" : ""}`}>
        <div className="in">
          <button type="button" className="btn ghost sm" onClick={() => setPending({})}>
            Xoá
          </button>
          <div className="info">
            <div className="l1">{cart.cnt} vật tư trong đơn</div>
            <div className="l2 num">
              {fmt(cart.sum)}
              <span className="u">đ</span>
            </div>
          </div>
          <button type="button" className="btn" onClick={createOrder}>
            Tạo đơn
          </button>
        </div>
      </div>

      {/* sửa đơn */}
      {editing && (
        <EditSheet
          order={editing}
          projectId={projectId}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await loadOrders();
            toast("Đã lưu đơn");
          }}
        />
      )}

      <div className={`toast${toastMsg ? " show" : ""}`}>{toastMsg}</div>

      {/* AI drawer — portal ra body (pattern proven của du-toan) */}
      {aiOpen &&
        mounted &&
        createPortal(
          <div className="mh-ai-scrim" onClick={() => setAiOpen(false)}>
            <div className="mh-ai-box" onClick={(e) => e.stopPropagation()}>
              <div className="mh-ai-head">
                <b>🤖 AI đơn mua hàng — {projectCode}</b>
                <button type="button" className="x" onClick={() => setAiOpen(false)} aria-label="Đóng">
                  ✕
                </button>
              </div>
              <iframe
                src={`https://huynhgia6.com/claude/chat?arg=muahang-${encodeURIComponent(projectCode)}`}
                title="AI đơn mua hàng"
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function BuyList({
  groups,
  phaseNames,
  placed,
  pending,
  open,
  setOpen,
  setQty,
}: {
  groups: Group[];
  phaseNames: Record<string, string>;
  placed: Record<string, number>;
  pending: Record<string, number>;
  open: Record<string, boolean>;
  setOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setQty: (key: string, v: string) => void;
}) {
  if (!groups.length)
    return (
      <div className="empty">
        <div className="ic">📦</div>
        Dự toán chưa có vật tư nào.
      </div>
    );
  let lastph = "";
  return (
    <div>
      {groups.map((g) => {
        const head = g.minph !== lastph ? ((lastph = g.minph), true) : false;
        const pl = placed[g.key] || 0;
        const rem = g.total - pl;
        const done = rem <= 0.0001;
        const uv = pending[g.key];
        const has = !!uv && uv > 0;
        const isOpen = !!open[g.key];
        return (
          <div key={g.key}>
            {head && (
              <div className="phead">
                <span className="pi">GĐ {g.minph}</span>
                <span className="pn">{phaseNames[g.minph] || ""}</span>
              </div>
            )}
            <div className={`mc${isOpen ? " open" : ""}`}>
              <div className="top">
                <button type="button" className="tapzone" onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}>
                  <div className="rn">
                    <span className="chev">▸</span>
                    <span className="nm">{g.name}</span>
                  </div>
                  <div className="nums">
                    <span>
                      DT <b>{fmtQ(g.total)}</b> {g.unit}
                    </span>
                    {pl > 0 && (
                      <span className="done">
                        Đặt <b>{fmtQ(pl)}</b>
                      </span>
                    )}
                    <span className={done ? "done" : "rem"}>
                      Còn <b>{fmtQ(rem > 0 ? rem : 0)}</b>
                    </span>
                    {g.uprice > 0 && (
                      <span className="price">
                        <b>{fmt(g.uprice)}</b> đ/{g.unit}
                      </span>
                    )}
                  </div>
                </button>
                <div className="ord">
                  <label>Mua</label>
                  <div className={`inrow${has ? " has" : ""}`}>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={uv || ""}
                      onChange={(e) => setQty(g.key, e.target.value)}
                    />
                    <span className="u">{g.unit}</span>
                  </div>
                  {rem > 0.0001 && (
                    <button type="button" className="fill" onClick={() => setQty(g.key, String(Math.round(rem * 1000) / 1000))}>
                      = còn {fmtQ(rem)}
                    </button>
                  )}
                </div>
              </div>
              <div className="bd">
                {g.lines.map((l) => (
                  <div key={l.id} className="bl">
                    <span className="bc">{l.taskCode}</span>
                    <span className="bn">{l.taskName}</span>
                    <span className="bq">
                      {fmtQ(l.quantity)} {l.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrdersList({
  orders,
  onEdit,
  onDel,
  onPO,
}: {
  orders: Order[];
  onEdit: (o: Order) => void;
  onDel: (o: Order) => void;
  onPO: (o: Order) => void;
}) {
  if (!orders.length)
    return (
      <div className="empty">
        <div className="ic">📋</div>
        Chưa có đơn nào.
        <br />
        Qua tab Mua hàng, nhập SL rồi bấm Tạo đơn.
      </div>
    );
  return (
    <div>
      {orders.map((o) => (
        <div key={o.id} className="ord-card" onClick={() => onEdit(o)}>
          <div className="oh">
            <span className="on">Đơn #{o.seq}</span>
            <span className={`chip ${o.status}`}>{stLabel(o.status)}</span>
          </div>
          <div className="sup">
            {o.supplierName || "Chưa gán NCC"} · {fmtDate(o.orderDate)}
          </div>
          <div className="ov num">
            {fmt(o.total)} đ<span className="cnt2">{o.items.length} vật tư</span>
          </div>
          <div className="oact" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="linkbtn" onClick={() => onPO(o)}>
              ⭳ Tải PO
            </button>
            <button type="button" className="del" onClick={() => onDel(o)}>
              Xoá
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EditSheet({
  order,
  onClose,
  onSaved,
  projectId,
}: {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
  projectId: string;
}) {
  const [show, setShow] = useState(false);
  const [supplierName, setSupplierName] = useState(order.supplierName || "");
  const [orderDate, setOrderDate] = useState(order.orderDate ? order.orderDate.slice(0, 10) : "");
  const [deliveryDate, setDeliveryDate] = useState(order.deliveryDate ? order.deliveryDate.slice(0, 10) : "");
  const [status, setStatus] = useState<Order["status"]>(order.status);
  const [note, setNote] = useState(order.note || "");
  const [prices, setPrices] = useState<number[]>(order.items.map((it) => it.price));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const total = order.items.reduce((s, it, i) => s + it.qty * (prices[i] || 0), 0);

  const save = async () => {
    setSaving(true);
    const r = await fetch(`/api/projects/${projectId}/mua-hang/${order.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        supplierName,
        orderDate: orderDate ? new Date(orderDate).toISOString() : undefined,
        deliveryDate: deliveryDate || null,
        status,
        note,
        prices,
      }),
    });
    setSaving(false);
    if (r.ok) onSaved();
  };

  return (
    <>
      <div className={`scrim${show ? " show" : ""}`} onClick={onClose} />
      <div className={`sheet${show ? " show" : ""}`} role="dialog" aria-modal="true">
        <div className="grip" />
        <div className="shead">
          <div>
            <div className="se">Đơn đặt hàng</div>
            <div className="st">Đơn #{order.seq}</div>
          </div>
          <button type="button" className="xclose" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="sbody">
          <div className="fld">
            <label>Nhà cung cấp (NCC)</label>
            <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Tên NCC / cửa hàng" />
          </div>
          <div className="row2">
            <div className="fld">
              <label>Ngày đặt</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="fld">
              <label>Ngày nhận dự kiến</label>
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
          </div>
          <div className="fld">
            <label>Trạng thái</label>
            <div className="segs">
              {STATUS.map((s) => (
                <button key={s.k} type="button" className={`seg${status === s.k ? " on" : ""}`} onClick={() => setStatus(s.k)}>
                  {s.l}
                </button>
              ))}
            </div>
          </div>
          <div className="fld">
            <label>Ghi chú</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Điều kiện giao, thanh toán, phụ kiện..."
              rows={2}
            />
          </div>
          <div className="fld">
            <label>Vật tư · đơn giá (sửa được, SL khoá theo dự toán)</label>
            <div className="eitems">
              {order.items.map((it, i) => (
                <div key={it.key} className="eit">
                  <div className="en">
                    {it.name}
                    <div className="eq">
                      {fmtQ(it.qty)} {it.unit} · SL khoá 🔒
                    </div>
                  </div>
                  <div className="ep">
                    <input
                      type="number"
                      inputMode="numeric"
                      step="any"
                      min="0"
                      value={prices[i]}
                      onChange={(e) => {
                        const v = Math.round(parseFloat(e.target.value) || 0);
                        setPrices((p) => p.map((x, j) => (j === i ? v : x)));
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="etot">
              <span className="k">Tổng đơn</span>
              <span className="v num">{fmt(total)} đ</span>
            </div>
          </div>
          <div className="sactions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Huỷ
            </button>
            <button type="button" className="btn" onClick={save} disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu đơn"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
