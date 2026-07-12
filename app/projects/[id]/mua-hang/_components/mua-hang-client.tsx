"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

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
const stChip: Record<string, string> = {
  draft: "border-[#3a3f55] bg-[#22273a] text-[#9aa3c0]",
  ordered: "border-[#f97316]/50 bg-[#f97316]/15 text-[#fb923c]",
  received: "border-[#2d6cf6]/50 bg-[#2d6cf6]/15 text-[#7aa2ff]",
  paid: "border-emerald-500/50 bg-emerald-500/15 text-emerald-400",
};

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
  useEffect(() => setMounted(true), []);

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

  if (loading) return <div className="p-6 text-sm text-[#8892b0]">Đang tải dự toán…</div>;
  if (err) return <div className="p-6 text-sm text-red-400">{err}</div>;

  return (
    <div className="mx-auto max-w-3xl px-3 pb-28 pt-3 text-[#e6e9f5]">
      {/* header */}
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold text-[#f0f2ff]">Mua hàng</div>
          <div className="truncate text-xs text-[#7c85a8]">{projectName} · bám dự toán</div>
        </div>
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#2d6cf6]/50 bg-[#2d6cf6]/15 px-3 py-1.5 text-sm font-semibold text-[#7aa2ff] hover:bg-[#2d6cf6]/25"
          title="AI quản lý đơn mua hàng"
        >
          <Sparkles className="h-4 w-4" /> AI đơn
        </button>
      </div>

      {/* summary */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label={`${groups.length} chủng loại`} value={`${fmt(summary.tot)} đ`} sub="Dự toán VT" />
        <Stat label={`${summary.pct}% dự toán`} value={`${fmt(summary.pl)} đ`} sub="Đã đặt" accent />
        <Stat label={`${orders.length} đơn`} value={`${fmt(summary.remain)} đ`} sub="Còn lại" />
      </div>

      {/* tabs */}
      <div className="mb-3 flex gap-1 rounded-xl border border-[#252840] bg-[#13151f] p-1">
        {(["buy", "orders"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === t ? "bg-[#f97316]/20 text-[#fb923c]" : "text-[#7c85a8] hover:text-[#e6e9f5]"
            }`}
          >
            {t === "buy" ? "Mua hàng" : `Đơn đã tạo (${orders.length})`}
          </button>
        ))}
      </div>

      {tab === "buy" ? (
        <BuyList
          groups={groups}
          phaseNames={phaseNames}
          placed={placed}
          pending={pending}
          open={open}
          setOpen={setOpen}
          setQty={setQty}
        />
      ) : (
        <OrdersList orders={orders} onEdit={setEditing} onDel={delOrder} onPO={downloadPO} />
      )}

      {/* cart nổi */}
      {tab === "buy" && cart.cnt > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#252840] bg-[#0d0f18]/95 px-3 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <button
              type="button"
              onClick={() => setPending({})}
              className="rounded-lg border border-[#2b3048] px-3 py-2 text-sm text-[#9aa3c0] hover:bg-[#1a1d2e]"
            >
              Xoá
            </button>
            <div className="text-sm text-[#9aa3c0]">
              <b className="text-[#f0f2ff]">{cart.cnt}</b> VT · ~
              <b className="text-[#fb923c]"> {fmt(cart.sum)} đ</b>
            </div>
            <button
              type="button"
              onClick={createOrder}
              className="ml-auto rounded-lg bg-[#f97316] px-5 py-2 text-sm font-bold text-white hover:bg-[#ea6a0e]"
            >
              Tạo đơn
            </button>
          </div>
        </div>
      )}

      {editing && (
        <EditSheet
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await loadOrders();
            toast("Đã lưu đơn");
          }}
          projectId={projectId}
        />
      )}

      {aiOpen && mounted && (
        <AiSheet code={projectCode} onClose={() => setAiOpen(false)} />
      )}

      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-[#1a1d2e] px-4 py-2 text-sm text-[#e6e9f5] shadow-xl ring-1 ring-[#2d3249]">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[#252840] bg-[#13151f] p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-[#5a6080]">{sub}</div>
      <div className={`mt-0.5 truncate text-sm font-bold ${accent ? "text-[#fb923c]" : "text-[#f0f2ff]"}`}>{value}</div>
      <div className="truncate text-[10px] text-[#6b7396]">{label}</div>
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
    return <div className="rounded-xl border border-[#252840] bg-[#13151f] p-6 text-center text-sm text-[#7c85a8]">Dự toán chưa có vật tư nào.</div>;
  let lastph = "";
  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const head = g.minph !== lastph ? ((lastph = g.minph), true) : false;
        const pl = placed[g.key] || 0;
        const rem = g.total - pl;
        const done = rem <= 0.0001;
        const uv = pending[g.key] || "";
        const isOpen = !!open[g.key];
        return (
          <div key={g.key}>
            {head && (
              <div className="mb-1 mt-3 flex items-center gap-2 px-1">
                <span className="rounded bg-[#f97316]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#fb923c]">GĐ {g.minph}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[#7c85a8]">{phaseNames[g.minph] || ""}</span>
              </div>
            )}
            <div className="rounded-xl border border-[#252840] bg-[#13151f]">
              <div className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5 font-semibold text-[#f0f2ff]">
                    <span className={`text-[#f97316] transition ${isOpen ? "rotate-90" : ""}`}>▸</span>
                    <span className="truncate">{g.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-5 text-[11px]">
                    <span className="text-[#9aa3c0]">
                      DT <b className="text-[#e6e9f5]">{fmtQ(g.total)}</b> {g.unit}
                    </span>
                    {pl > 0 && (
                      <span className="text-emerald-400">
                        Đặt <b>{fmtQ(pl)}</b>
                      </span>
                    )}
                    <span className={done ? "text-emerald-400" : "text-[#fb923c]"}>
                      Còn <b>{fmtQ(rem > 0 ? rem : 0)}</b>
                    </span>
                    {g.uprice > 0 && (
                      <span className="tabular-nums text-[#6b7396]">
                        {fmt(g.uprice)} đ/{g.unit}
                      </span>
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-2 pl-5 sm:pl-0">
                  <div className="flex items-center gap-1 rounded-lg border border-[#2b3048] bg-[#0d0f18] px-2 py-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={uv}
                      onChange={(e) => setQty(g.key, e.target.value)}
                      className="w-16 bg-transparent text-right text-sm text-[#f0f2ff] outline-none"
                    />
                    <span className="text-xs text-[#6b7396]">{g.unit}</span>
                  </div>
                  {rem > 0.0001 && (
                    <button
                      type="button"
                      onClick={() => setQty(g.key, String(Math.round(rem * 1000) / 1000))}
                      className="whitespace-nowrap text-[11px] text-[#7aa2ff] hover:underline"
                    >
                      = còn {fmtQ(rem)}
                    </button>
                  )}
                </div>
              </div>
              {isOpen && (
                <div className="border-t border-[#1f2333] px-3 py-2">
                  <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-[#5a6080]">
                    Dùng cho {g.lines.length} công tác
                  </div>
                  <div className="space-y-0.5">
                    {g.lines.map((l) => (
                      <div key={l.id} className="flex items-center gap-2 text-[11px]">
                        <span className="rounded bg-[#1a1d2e] px-1 py-0.5 font-mono text-[10px] text-[#7c85a8]">{l.taskCode}</span>
                        <span className="min-w-0 flex-1 truncate text-[#9aa3c0]">{l.taskName}</span>
                        <span className="tabular-nums text-[#e6e9f5]">
                          {fmtQ(l.quantity)} {l.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
      <div className="rounded-xl border border-[#252840] bg-[#13151f] p-8 text-center text-sm text-[#7c85a8]">
        <div className="mb-1 text-2xl">📋</div>
        Chưa có đơn nào.
        <br />
        Qua tab Mua hàng, nhập SL rồi bấm Tạo đơn.
      </div>
    );
  return (
    <div className="space-y-2">
      {orders.map((o) => (
        <div
          key={o.id}
          className="cursor-pointer rounded-xl border border-[#252840] bg-[#13151f] p-3 transition hover:border-[#f97316]/50"
          onClick={() => onEdit(o)}
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#f0f2ff]">Đơn #{o.seq}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stChip[o.status]}`}>
              {stLabel(o.status)}
            </span>
          </div>
          <div className="mt-1 text-xs text-[#7c85a8]">
            {o.supplierName || "Chưa gán NCC"} · {fmtDate(o.orderDate)}
          </div>
          <div className="mt-1 text-sm tabular-nums text-[#e6e9f5]">
            {fmt(o.total)} đ · {o.items.length} vật tư
          </div>
          <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onPO(o)}
              className="rounded-lg border border-[#2b3048] px-3 py-1 text-xs text-[#9aa3c0] hover:bg-[#1a1d2e]"
            >
              ⭳ Tải PO
            </button>
            <button
              type="button"
              onClick={() => onDel(o)}
              className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10"
            >
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
  const [supplierName, setSupplierName] = useState(order.supplierName || "");
  const [orderDate, setOrderDate] = useState(order.orderDate ? order.orderDate.slice(0, 10) : "");
  const [deliveryDate, setDeliveryDate] = useState(order.deliveryDate ? order.deliveryDate.slice(0, 10) : "");
  const [status, setStatus] = useState<Order["status"]>(order.status);
  const [note, setNote] = useState(order.note || "");
  const [prices, setPrices] = useState<number[]>(order.items.map((it) => it.price));
  const [saving, setSaving] = useState(false);

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

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 sm:items-center sm:p-3" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[#2d3249] bg-[#0d0f18] text-[#e6e9f5] shadow-2xl sm:w-[480px] sm:rounded-2xl"
      >
        <div className="flex items-center gap-2 border-b border-[#252840] px-4 py-3">
          <span className="font-bold text-[#f0f2ff]">Đơn #{order.seq}</span>
          <button type="button" onClick={onClose} className="ml-auto text-[#8b95b7] hover:text-white">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <Field label="Nhà cung cấp (NCC)">
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Tên NCC / cửa hàng"
              className="w-full rounded-lg border border-[#2b3048] bg-[#13151f] px-3 py-2 text-sm outline-none focus:border-[#f97316]/60"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ngày đặt">
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full rounded-lg border border-[#2b3048] bg-[#13151f] px-3 py-2 text-sm outline-none focus:border-[#f97316]/60"
              />
            </Field>
            <Field label="Ngày nhận dự kiến">
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full rounded-lg border border-[#2b3048] bg-[#13151f] px-3 py-2 text-sm outline-none focus:border-[#f97316]/60"
              />
            </Field>
          </div>
          <Field label="Trạng thái">
            <div className="flex flex-wrap gap-1.5">
              {STATUS.map((s) => (
                <button
                  key={s.k}
                  type="button"
                  onClick={() => setStatus(s.k)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                    status === s.k ? stChip[s.k] : "border-[#2b3048] text-[#7c85a8] hover:text-[#e6e9f5]"
                  }`}
                >
                  {s.l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Ghi chú">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Điều kiện giao, thanh toán, phụ kiện..."
              rows={2}
              className="w-full rounded-lg border border-[#2b3048] bg-[#13151f] px-3 py-2 text-sm outline-none focus:border-[#f97316]/60"
            />
          </Field>
          <Field label="Vật tư · đơn giá (sửa được, SL khoá theo dự toán)">
            <div className="space-y-1.5">
              {order.items.map((it, i) => (
                <div key={it.key} className="flex items-center gap-2 rounded-lg border border-[#1f2333] bg-[#13151f] px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-[#e6e9f5]">{it.name}</div>
                    <div className="text-[11px] text-[#6b7396]">
                      {fmtQ(it.qty)} {it.unit} <span className="text-[#5a6080]">· SL khoá 🔒</span>
                    </div>
                  </div>
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
                    className="w-24 rounded-lg border border-[#2b3048] bg-[#0d0f18] px-2 py-1 text-right text-sm outline-none focus:border-[#f97316]/60"
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-[#13151f] px-3 py-2">
              <span className="text-xs text-[#7c85a8]">Tổng đơn</span>
              <span className="tabular-nums font-bold text-[#fb923c]">{fmt(total)} đ</span>
            </div>
          </Field>
        </div>
        <div className="flex gap-2 border-t border-[#252840] p-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[#2b3048] py-2 text-sm text-[#9aa3c0] hover:bg-[#1a1d2e]"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-lg bg-[#f97316] py-2 text-sm font-bold text-white hover:bg-[#ea6a0e] disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu đơn"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6b7396]">{label}</label>
      {children}
    </div>
  );
}

function AiSheet({ code, onClose }: { code: string; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 sm:items-center sm:p-3"
      style={{ height: "100dvh" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden rounded-t-2xl border border-[#2d3249] bg-[#0b0d16] shadow-2xl sm:w-auto sm:rounded-2xl"
        style={{ width: "min(480px, 100%)", height: "calc(100dvh - 8px)", maxHeight: "100dvh" }}
      >
        <div className="flex items-center gap-2 border-b border-[#252840] bg-[#12141f] px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7aa2ff]">
            <Sparkles className="h-4 w-4" /> AI đơn mua hàng · {code}
          </span>
          <button type="button" onClick={onClose} className="ml-auto rounded-md px-2 py-0.5 text-[#8b95b7] hover:bg-[#252840] hover:text-white">
            ✕
          </button>
        </div>
        <iframe
          src={`https://huynhgia6.com/claude/chat?arg=muahang-${encodeURIComponent(code)}`}
          title="AI đơn mua hàng"
          className="w-full flex-1 border-0"
        />
      </div>
    </div>,
    document.body,
  );
}
