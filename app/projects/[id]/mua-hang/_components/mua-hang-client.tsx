"use client";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Badge suy từ (status + có NCC hay không). received khác nghĩa tuỳ có công nợ.
const stBadge = (
  status: string,
  supplierName: string | null,
): { label: string; cls: string } => {
  const hasNcc = !!(supplierName && supplierName.trim());
  switch (status) {
    case "draft":
      return { label: "Nháp", cls: "draft" };
    case "ordered":
      return { label: "Đã đặt", cls: "ordered" };
    case "received":
      return hasNcc
        ? { label: "Đã ghi công nợ", cls: "debt" }
        : { label: "Chờ thanh toán", cls: "await" };
    case "paid":
      return { label: "Đã thanh toán", cls: "paid" };
    default:
      return { label: stLabel(status), cls: "ordered" };
  }
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

// Đọc số tiền → chữ tiếng Việt (đủ dùng cho đơn hàng, tới hàng tỷ)
const CHUSO = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const docBaSo = (n: number, full: boolean): string => {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const dv = n % 10;
  let s = "";
  if (full || tram > 0) s += `${CHUSO[tram]} trăm`;
  if (chuc > 1) {
    s += ` ${CHUSO[chuc]} mươi`;
    if (dv === 1) s += " mốt";
    else if (dv === 5) s += " lăm";
    else if (dv > 0) s += ` ${CHUSO[dv]}`;
  } else if (chuc === 1) {
    s += " mười";
    if (dv === 5) s += " lăm";
    else if (dv > 0) s += ` ${CHUSO[dv]}`;
  } else if (dv > 0) {
    if (full || tram > 0) s += " lẻ";
    s += ` ${CHUSO[dv]}`;
  }
  return s.trim();
};
const docTien = (num: number): string => {
  const n = Math.round(num || 0);
  if (n <= 0) return "Không đồng";
  const units = ["", "nghìn", "triệu", "tỷ"];
  const groups: number[] = [];
  let x = n;
  while (x > 0) {
    groups.push(x % 1000);
    x = Math.floor(x / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    parts.push(docBaSo(groups[i], i < groups.length - 1) + (units[i] ? ` ${units[i]}` : ""));
  }
  const s = parts.join(" ").replace(/\s+/g, " ").trim();
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} đồng`;
};

// CSS phiếu PO — scope dưới .po-sheet, dùng chung cho modal (xem/ảnh) và cửa sổ in.
const PO_CSS = `
.po-sheet{box-sizing:border-box;background:#fff;color:#1c1917;font-family:"Segoe UI",Roboto,system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;font-size:13px;line-height:1.5;padding:30px 32px;min-width:0;container-type:inline-size}
.po-sheet *{box-sizing:border-box}
.po-sheet .h{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
.po-sheet .brand-logo{height:34px;width:auto;display:block}
.po-sheet .co{margin-top:9px;font-size:10.5px;color:#4b4540;line-height:1.6;max-width:340px}
.po-sheet .co .nm{font-weight:700;color:#1c1917;font-size:11.5px;letter-spacing:.2px;text-transform:uppercase}
.po-sheet .co .row span{color:#8a8178}
.po-sheet .doc-id{text-align:right;flex-shrink:0}
.po-sheet .doc-id .kicker{font-size:9.5px;letter-spacing:2.5px;color:#8a8178;text-transform:uppercase}
.po-sheet .doc-id .no{font-size:21px;font-weight:800;color:#e36122;letter-spacing:.5px;line-height:1.15;margin-top:2px}
.po-sheet .doc-id .no small{color:#8a8178;font-weight:600;font-size:12px}
.po-sheet .rule{height:2px;background:#1c1917;margin:12px 0 0}
.po-sheet .title{text-align:center;margin:20px 0 4px}
.po-sheet .title h1{margin:0;font-size:23px;font-weight:800;letter-spacing:5px}
.po-sheet .title .sub{font-size:10px;letter-spacing:4px;color:#8a8178;text-transform:uppercase;margin-top:3px}
.po-sheet .title .brand{height:3px;width:64px;background:#e36122;margin:8px auto 0}
.po-sheet .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:18px}
.po-sheet .card{border:1px solid #e2dcd2;border-radius:8px;padding:12px 14px;min-width:0}
.po-sheet .card h3{margin:0 0 8px;font-size:9.5px;letter-spacing:1.8px;text-transform:uppercase;color:#a6410f;font-weight:700}
.po-sheet .kv{display:grid;grid-template-columns:96px 1fr;row-gap:6px;font-size:12px;line-height:1.5;margin:0;min-width:0}
.po-sheet .kv dt{color:#8a8178}
.po-sheet .kv dd{margin:0;font-weight:600;color:#1c1917;min-width:0;overflow-wrap:anywhere}
.po-sheet .kv dd.blank{color:#c9c1b4;font-weight:400;letter-spacing:2px}
.po-sheet .tbl-wrap{margin-top:16px;overflow-x:auto}
.po-sheet table{width:100%;border-collapse:collapse;font-size:12px}
.po-sheet thead th{background:#1c1917;color:#fff;font-weight:600;font-size:10px;letter-spacing:.6px;text-transform:uppercase;padding:9px 10px;text-align:left}
.po-sheet thead th.c{text-align:center}
.po-sheet thead th.r{text-align:right}
.po-sheet tbody td{padding:8px 10px;border-bottom:1px solid #e2dcd2;vertical-align:top}
.po-sheet tbody tr:nth-child(even){background:#faf7f2}
.po-sheet td.c{text-align:center;color:#4b4540}
.po-sheet td.r{text-align:right;font-variant-numeric:tabular-nums}
.po-sheet td.nm{font-weight:600}
.po-sheet tfoot td{padding:11px 10px;font-weight:700}
.po-sheet tfoot .lbl{text-align:right;letter-spacing:.5px;text-transform:uppercase;font-size:11px}
.po-sheet tfoot .sum{text-align:right;font-variant-numeric:tabular-nums}
.po-sheet tfoot .grand td{background:#fbeee5;color:#a6410f;font-size:15px;border-top:2px solid #e36122}
.po-sheet .amount-words{margin-top:10px;font-size:12px;color:#4b4540}
.po-sheet .amount-words b{color:#1c1917;font-style:italic}
.po-sheet .terms{margin-top:16px;border-left:3px solid #e36122;background:#fbeee5;padding:11px 14px;border-radius:0 8px 8px 0}
.po-sheet .terms h4{margin:0 0 6px;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#a6410f}
.po-sheet .terms ol{margin:0;padding-left:18px;font-size:11.5px;color:#4b4540;line-height:1.7}
.po-sheet .sign{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:36px;text-align:center}
.po-sheet .sign .role{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.po-sheet .sign .hint{font-size:10px;color:#8a8178;margin-top:2px}
.po-sheet .sign .space{height:60px}
.po-sheet .sign .name{font-size:11px;color:#8a8178;border-top:1px dotted #c9c1b4;padding-top:5px}
.po-sheet .sign .ks{border:2px solid #e36122;border-radius:8px;padding:12px 14px 10px}
.po-sheet .sign .ks .role{color:#a6410f}
.po-sheet .sign .ks .hint{color:#a6410f;font-weight:600}
.po-sheet .sign .ks .name{color:#1c1917;font-weight:600;border-top-color:#e36122}
.po-sheet .foot{margin-top:20px;text-align:center;font-size:10px;color:#8a8178;letter-spacing:.3px}
/* Tờ giấy hẹp (xem trên điện thoại): thu gọn để bảng 6 cột đủ chỗ, không cắt. Ảnh/in dùng khổ rộng nên không dính. */
@container (max-width:440px){
  .po-sheet{padding:22px 13px}
  .po-sheet .title h1{font-size:19px;letter-spacing:2px}
  .po-sheet table{font-size:9.5px}
  .po-sheet thead th{font-size:8px;letter-spacing:0;padding:6px 3px}
  .po-sheet tbody td{padding:6px 3px}
  .po-sheet tfoot td{padding:8px 3px}
  .po-sheet tfoot .grand td{font-size:12px}
}
`;

type Block = {
  key: string;
  kind: "missing_price" | "over_budget";
  materialName: string;
  unit: string;
  need: number;
  have: number;
  budget: number;
  count: number;
  lastAt: string;
  lastBy: string;
};

export function MuaHangClient({
  projectId,
  projectCode,
  projectName,
  ksName,
  ksPhone,
  isKeToan = false,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  ksName: string;
  ksPhone: string;
  isKeToan?: boolean;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [phaseNames, setPhaseNames] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"buy" | "orders" | "received" | "blocks">("buy");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [pending, setPending] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Order | null>(null);
  const [poOrder, setPoOrder] = useState<Order | null>(null);
  const poRef = useRef<HTMLDivElement>(null);
  const poScrollRef = useRef<HTMLDivElement>(null);
  const poFitRef = useRef<HTMLDivElement>(null);
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

  // Preview PO = tờ A4 cố định 794px thu nhỏ vừa modal (WYSIWYG — giống hệt ảnh/bản in, chỉ zoom nhỏ)
  useEffect(() => {
    if (!poOrder || !mounted) return;
    const scroll = poScrollRef.current;
    const fit = poFitRef.current;
    const sheet = poRef.current;
    if (!scroll || !fit || !sheet) return;
    const apply = () => {
      const avail = scroll.clientWidth - 32; // trừ padding .po-scroll (16*2)
      const scale = Math.min(1, avail / 794);
      sheet.style.transformOrigin = "top left";
      sheet.style.transform = `scale(${scale})`;
      fit.style.width = `${794 * scale}px`;
      fit.style.height = `${sheet.offsetHeight * scale}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(scroll);
    sheet.querySelectorAll("img").forEach((img) => {
      if (!img.complete) img.addEventListener("load", apply, { once: true });
    });
    const t = window.setTimeout(apply, 150);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [poOrder, mounted]);

  const loadOrders = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/mua-hang`, { cache: "no-store" });
    const j = await r.json();
    setOrders(Array.isArray(j.items) ? j.items : []);
  }, [projectId]);

  // Log chặn (chỉ admin). Tải khi mở tab.
  const loadBlocks = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/mua-hang/blocks`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    setBlocks(Array.isArray(j.items) ? j.items : []);
  }, [projectId]);

  useEffect(() => {
    if (tab === "blocks" && !isKeToan) loadBlocks();
  }, [tab, isKeToan, loadBlocks]);

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
      // Tách theo giai đoạn: cùng vật tư nhưng khác GĐ = dòng riêng (bê tông hiện ở cả GĐ 02/03/04)
      const key = `${ph}|${b}|${m.unit}`;
      if (!map[key]) {
        map[key] = { key, name: b, unit: m.unit, lines: [], total: 0, amount: 0, uprice: 0, minph: ph };
        out.push(map[key]);
      }
      const g = map[key];
      g.lines.push(m);
      g.total += m.quantity;
      g.amount += m.quantity * m.unitPrice;
    }
    out.forEach((g) => (g.uprice = g.total > 0 ? g.amount / g.total : 0));
    out.sort((a, b) => (a.minph !== b.minph ? (a.minph < b.minph ? -1 : 1) : b.amount - a.amount));
    return out;
  }, [materials]);

  // Tổng đã đặt theo VẬT TƯ (không phân biệt GĐ). Dùng it.key ("tên gốc|đvt") — KHÔNG dùng
  // it.name (nhãn tự do do người đặt gõ). Bỏ tiền tố GĐ "NN|" nếu có để về "tên|đvt".
  const matKey = (k: string) => k.replace(/^\d{2}\|/, "");
  const placedByMat = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    orders.forEach((o) =>
      o.items.forEach((it) => {
        const mk = matKey(it.key || `${it.name}|${it.unit}`);
        m[mk] = (m[mk] || 0) + it.qty;
      }),
    );
    return m;
  }, [orders]);

  // Phân bổ waterfall: số đã đặt của 1 vật tư fill GĐ sớm nhất trước, dư mới sang GĐ sau.
  // (groups đã sắp theo GĐ tăng dần nên duyệt tuần tự là đúng thứ tự.)
  const placed = useMemo<Record<string, number>>(() => {
    const pool: Record<string, number> = { ...placedByMat };
    const res: Record<string, number> = {};
    for (const g of groups) {
      const mk = `${g.name}|${g.unit}`;
      const avail = pool[mk] || 0;
      const take = Math.min(avail, g.total);
      res[g.key] = take;
      pool[mk] = avail - take;
    }
    return res;
  }, [groups, placedByMat]);

  // "Đã nhận" = đã nhận hàng (received) hoặc đã thanh toán (paid). Còn lại = chưa nhận.
  const isReceived = (s: Order["status"]) => s === "received" || s === "paid";
  const ordersPending = useMemo(() => orders.filter((o) => !isReceived(o.status)), [orders]);
  const ordersReceived = useMemo(() => orders.filter((o) => isReceived(o.status)), [orders]);

  // Kế toán: SL không vượt "còn lại" dự toán (max). Admin: max undefined = tự do.
  const setQty = (key: string, v: string, max?: number) => {
    let n = parseFloat(v);
    if (isNaN(n) || n <= 0) n = 0;
    if (max != null && n > max) {
      n = max > 0 ? Math.round(max * 1000) / 1000 : 0;
      toast("Vượt dự toán — đã chỉnh về SL còn lại. Cần thêm: gọi admin.");
    }
    setPending((p) => ({ ...p, [key]: n }));
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
    // Kế toán không được xoá đơn đã nhận / đã thanh toán (đã ghi công nợ NCC).
    if (isKeToan && isReceived(o.status)) {
      toast("Đơn đã nhận — kế toán không được xoá. Liên hệ admin.");
      return;
    }
    if (!window.confirm(`Xoá đơn #${o.seq}? Số đã đặt sẽ trừ lại.`)) return;
    const r = await fetch(`/api/projects/${projectId}/mua-hang/${o.id}`, { method: "DELETE" });
    if (r.ok) {
      await loadOrders();
      toast(`Đã xoá đơn #${o.seq}`);
    } else {
      const j = await r.json().catch(() => ({}));
      toast(j.message || "Không xoá được đơn.");
    }
  };

  // Nội dung PO dùng chung cho modal (xem/ảnh) và cửa sổ in
  const poBodyHtml = (o: Order) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const logoSrc = `${origin}/po-logo.png`;
    const pad = String(o.seq).padStart(4, "0");
    const dots = "................";
    // Gộp vật tư cùng tên+ĐVT (đặt ở nhiều GĐ) thành 1 dòng trên PO. Đơn giá = thành tiền / SL.
    const merged: { name: string; unit: string; qty: number; amount: number }[] = [];
    const midx: Record<string, number> = {};
    o.items.forEach((it) => {
      const mk = matKey(it.key || `${it.name}|${it.unit}`);
      if (midx[mk] == null) {
        midx[mk] = merged.length;
        merged.push({ name: it.name, unit: it.unit, qty: 0, amount: 0 });
      }
      const mm = merged[midx[mk]];
      mm.qty += it.qty;
      mm.amount += it.qty * it.price;
    });
    const rows = merged
      .map((it, i) => {
        const price = it.qty > 0 ? it.amount / it.qty : 0;
        return `<tr><td class="c">${i + 1}</td><td class="nm">${esc(it.name)}</td><td class="c">${esc(
          it.unit,
        )}</td><td class="r">${fmtQ(it.qty)}</td><td class="r">${fmt(price)}</td><td class="r">${fmt(
          it.amount,
        )}</td></tr>`;
      })
      .join("");
    const ksSignName = ksName ? `${esc(ksName)}${ksPhone ? ` · ${esc(ksPhone)}` : ""}` : "&nbsp;";
    return `<style>${PO_CSS}</style>
<div class="h">
  <div>
    <img class="brand-logo" src="${logoSrc}" alt="Huỳnh Gia">
    <div class="co">
      <div class="nm">Công ty TNHH Kiến trúc Xây dựng và Nội thất Huỳnh Gia</div>
      <div class="row"><span>Địa chỉ:</span> Số 2157 – QL.51, Ấp 1, Phước Bình, Long Thành, Đồng Nai</div>
      <div class="row"><span>MST:</span> 3604008952 · <span>Điện thoại:</span> 0931.316.513 · huynhgia6.com</div>
    </div>
  </div>
  <div class="doc-id"><div class="kicker">Số đơn hàng</div><div class="no">PO-${pad}<br><small>Ngày ${fmtDate(
      o.orderDate,
    )}</small></div></div>
</div>
<div class="rule"></div>
<div class="title"><h1>ĐƠN ĐẶT HÀNG</h1><div class="sub">Purchase Order</div><div class="brand"></div></div>
<div class="meta">
  <div class="card"><h3>Nhà cung cấp</h3><dl class="kv">
    <dt>Đơn vị</dt><dd${o.supplierName ? "" : ' class="blank"'}>${esc(o.supplierName || dots)}</dd>
    <dt>Người liên hệ</dt><dd class="blank">${dots}</dd>
    <dt>Điện thoại</dt><dd class="blank">${dots}</dd>
  </dl></div>
  <div class="card"><h3>Thông tin giao hàng</h3><dl class="kv">
    <dt>Công trình</dt><dd>${esc(projectName)}</dd>
    <dt>Ngày cần giao</dt><dd${o.deliveryDate ? "" : ' class="blank"'}>${fmtDate(o.deliveryDate) || dots}</dd>
    <dt>Hình thức</dt><dd>Giao tận công trình</dd>
    <dt>KS phụ trách</dt><dd${ksName ? "" : ' class="blank"'}>${esc(ksName || dots)}</dd>
    <dt>SĐT liên hệ</dt><dd${ksPhone ? "" : ' class="blank"'}>${esc(ksPhone || dots)}</dd>
  </dl></div>
</div>
<div class="tbl-wrap"><table>
  <thead><tr><th class="c">STT</th><th>Tên vật tư / quy cách</th><th class="c">ĐVT</th><th class="r">SL</th><th class="r">Đơn giá</th><th class="r">Thành tiền</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr class="grand"><td colspan="4"></td><td class="lbl">Tổng cộng</td><td class="sum">${fmt(o.total)}</td></tr></tfoot>
</table></div>
<p class="amount-words">Bằng chữ: <b>${docTien(o.total)}.</b></p>
${o.note ? `<div class="terms"><h4>Ghi chú</h4><ol style="list-style:none;padding-left:0"><li>${esc(o.note)}</li></ol></div>` : ""}
<div class="terms"><h4>Điều kiện đặt hàng</h4><ol>
  <li>Giao đúng chủng loại, quy cách, số lượng ghi trên đơn. Hàng không đạt được trả lại.</li>
  <li>Xuất hóa đơn / phiếu giao hàng kèm theo lô hàng.</li>
  <li><b>Đơn hàng CHỈ được thanh toán khi có chữ ký xác nhận của KS phụ trách công trình (ô ký bên phải). Không có chữ ký này, Huỳnh Gia không thanh toán.</b></li>
</ol></div>
<div class="sign">
  <div><div class="role">Nhà cung cấp</div><div class="hint">(Ký, ghi rõ họ tên)</div><div class="space"></div><div class="name">&nbsp;</div></div>
  <div class="ks"><div class="role">KS phụ trách công trình</div><div class="hint">Bắt buộc — đơn không có chữ ký này sẽ không được thanh toán</div><div class="space"></div><div class="name">${ksSignName}</div></div>
</div>
<div class="foot">Công ty TNHH Kiến trúc Xây dựng và Nội thất Huỳnh Gia · Xây Dựng Huỳnh Gia – Yên Tâm Nhận Nhà</div>`;
  };

  const printPOWindow = (o: Order) => {
    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>Đơn đặt hàng PO-${String(
      o.seq,
    ).padStart(4, "0")}</title><style>
@page{size:A4;margin:13mm}html,body{margin:0}
.po-sheet.po-print{padding:0;box-shadow:none;width:auto}
@media print{.noprint{display:none}.po-print{margin-top:0 !important}}
.pbar{position:fixed;top:12px;right:12px;left:12px;display:flex;justify-content:space-between;align-items:center;z-index:9;pointer-events:none}
.pbar button{pointer-events:auto;border:none;border-radius:8px;font:600 14px "Segoe UI",sans-serif;cursor:pointer}
.pclose{background:#3a2a22;color:#f5efe1;width:42px;height:42px;font-size:18px}
.pbtn{background:#e36122;color:#fff;padding:11px 18px}
</style></head><body>
<div class="pbar noprint">
<button class="pclose" onclick="window.close()" aria-label="Đóng">✕</button>
<button class="pbtn" onclick="window.print()">In / Lưu PDF</button>
</div>
<div class="po-sheet po-print" style="margin-top:56px">${poBodyHtml(o)}</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  // Chụp PO thành ảnh PNG → chia sẻ (Zalo…) hoặc tải về
  const sharePO = async () => {
    if (!poOrder) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      // Dựng bản A4 cố định (794×1123px @96dpi) ngoài màn hình → ảnh luôn đúng khổ A4,
      // không co hẹp theo bề rộng điện thoại (tránh ảnh dài sọc).
      const holder = document.createElement("div");
      holder.className = "po-sheet";
      holder.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;min-height:1123px;background:#fff";
      holder.innerHTML = poBodyHtml(poOrder);
      document.body.appendChild(holder);
      // Chờ logo tải xong trước khi chụp
      await Promise.all(
        Array.from(holder.querySelectorAll("img")).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((r) => {
                img.onload = img.onerror = () => r();
              }),
        ),
      );
      let canvas: HTMLCanvasElement;
      try {
        canvas = await html2canvas(holder, { scale: 2, backgroundColor: "#ffffff", width: 794, windowWidth: 794 });
      } finally {
        holder.remove();
      }
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) {
        toast("Tạo ảnh lỗi");
        return;
      }
      const file = new File([blob], `PO-${poOrder.seq}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: `PO #${poOrder.seq}` });
          return;
        } catch {
          /* user huỷ chia sẻ → thôi */
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PO-${poOrder.seq}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Đã tải ảnh PO");
    } catch {
      toast("Không tạo được ảnh PO");
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
            <span>Đơn hàng</span>
            <span className="cnt">{ordersPending.length}</span>
          </button>
          <button
            type="button"
            className={`tab${tab === "received" ? " on" : ""}`}
            onClick={() => setTab("received")}
          >
            <span>Đã nhận</span>
            <span className="cnt">{ordersReceived.length}</span>
          </button>
          {!isKeToan && (
            <button
              type="button"
              className={`tab${tab === "blocks" ? " on" : ""}`}
              onClick={() => setTab("blocks")}
            >
              <span>⚠ Chặn KT</span>
              {blocks.length > 0 && <span className="cnt">{blocks.length}</span>}
            </button>
          )}
        </div>

        <div className="panel">
          {loading ? (
            <div className="load">Đang tải dự toán…</div>
          ) : err ? (
            <div className="empty">{err}</div>
          ) : tab === "blocks" ? (
            <BlocksList blocks={blocks} />
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
                isKeToan={isKeToan}
              />
              <div className="foot">
                {isKeToan
                  ? "Nhập SL trong dự toán → Tạo đơn · Giá & định mức do admin quy định"
                  : "Nhập SL cần mua → Tạo đơn · Đúng — Đẹp — Bền"}
              </div>
            </>
          ) : tab === "orders" ? (
            <OrdersList
              orders={ordersPending}
              onEdit={setEditing}
              onDel={delOrder}
              onPO={setPoOrder}
              emptyText="Chưa có đơn hàng nào chờ nhận."
              hideDel={(o) => isKeToan && isReceived(o.status)}
            />
          ) : (
            <OrdersList
              orders={ordersReceived}
              onEdit={setEditing}
              onDel={delOrder}
              onPO={setPoOrder}
              emptyText="Chưa có đơn nào đã nhận."
              hideDel={(o) => isKeToan && isReceived(o.status)}
            />
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
          isKeToan={isKeToan}
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

      {/* PO modal — portal ra body: xem PO, ✕ đóng, 📷 gửi ảnh Zalo, in/PDF */}
      {poOrder &&
        mounted &&
        createPortal(
          <div className="po-overlay" onClick={() => setPoOrder(null)}>
            <div className="po-modal" onClick={(e) => e.stopPropagation()}>
              <div className="po-bar">
                <button type="button" className="po-x" onClick={() => setPoOrder(null)} aria-label="Đóng">
                  ✕
                </button>
                <div className="po-acts">
                  <button type="button" className="po-btn share" onClick={sharePO}>
                    📷 Gửi ảnh
                  </button>
                  <button type="button" className="po-btn" onClick={() => printPOWindow(poOrder)}>
                    🖨 In / PDF
                  </button>
                </div>
              </div>
              <div className="po-scroll" ref={poScrollRef}>
                <div className="po-fit" ref={poFitRef}>
                  <div
                    className="po-sheet po-a4"
                    ref={poRef}
                    dangerouslySetInnerHTML={{ __html: poBodyHtml(poOrder) }}
                  />
                </div>
              </div>
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
  isKeToan,
}: {
  groups: Group[];
  phaseNames: Record<string, string>;
  placed: Record<string, number>;
  pending: Record<string, number>;
  open: Record<string, boolean>;
  setOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setQty: (key: string, v: string, max?: number) => void;
  isKeToan: boolean;
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
                      max={isKeToan ? (rem > 0 ? rem : 0) : undefined}
                      placeholder="0"
                      value={uv || ""}
                      onChange={(e) => setQty(g.key, e.target.value, isKeToan ? rem : undefined)}
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
  emptyText,
  hideDel,
}: {
  orders: Order[];
  onEdit: (o: Order) => void;
  onDel: (o: Order) => void;
  onPO: (o: Order) => void;
  emptyText?: string;
  hideDel?: (o: Order) => boolean;
}) {
  if (!orders.length)
    return (
      <div className="empty">
        <div className="ic">📋</div>
        {emptyText || (
          <>
            Chưa có đơn nào.
            <br />
            Qua tab Mua hàng, nhập SL rồi bấm Tạo đơn.
          </>
        )}
      </div>
    );
  return (
    <div>
      {orders.map((o) => (
        <div key={o.id} className="ord-card" onClick={() => onEdit(o)}>
          <div className="oh">
            <span className="on">Đơn #{o.seq}</span>
            {(() => {
              const b = stBadge(o.status, o.supplierName);
              return <span className={`chip ${b.cls}`}>{b.label}</span>;
            })()}
          </div>
          <div className="sup">
            {o.supplierName || "Chưa gán NCC"} · {fmtDate(o.orderDate)}
          </div>
          <div className="ov num">
            {fmt(o.total)} đ<span className="cnt2">{o.items.length} vật tư</span>
          </div>
          <div className="oact" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="linkbtn" onClick={() => onPO(o)}>
              📄 Xem PO
            </button>
            {!hideDel?.(o) && (
              <button type="button" className="del" onClick={() => onDel(o)}>
                Xoá
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Log chặn kế toán — admin xem VT nào thiếu giá / vượt SL để xử lý dự toán.
function BlocksList({ blocks }: { blocks: Block[] }) {
  if (!blocks.length)
    return (
      <div className="empty">
        <div className="ic">✅</div>
        Chưa có lần chặn nào. Kế toán đặt hàng đều trong dự toán.
      </div>
    );
  return (
    <div>
      <div className="phead">
        <span className="pi">Cảnh báo</span>
        <span className="pn">Kế toán bị chặn — cần admin xử (duyệt giá / nới dự toán)</span>
      </div>
      {blocks.map((b) => {
        const miss = b.kind === "missing_price";
        return (
          <div key={b.key} className="ord-card" style={{ cursor: "default" }}>
            <div className="oh">
              <span className="on">{b.materialName}</span>
              <span className={`chip ${miss ? "await" : "debt"}`}>
                {miss ? "Thiếu giá" : "Vượt SL"}
              </span>
            </div>
            <div className="sup">
              {miss ? (
                <>Chưa có giá trong dự toán — cần admin duyệt giá vật tư.</>
              ) : (
                <>
                  Cần {fmtQ(b.need)} {b.unit} · còn {fmtQ(b.have)} · dự toán {fmtQ(b.budget)} {b.unit}
                </>
              )}
            </div>
            <div className="ov num" style={{ fontSize: 12, opacity: 0.7 }}>
              {b.count} lần · gần nhất {fmtDate(b.lastAt)} · {b.lastBy}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EditSheet({
  order,
  onClose,
  onSaved,
  projectId,
  isKeToan,
}: {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
  projectId: string;
  isKeToan: boolean;
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
            <label>
              {isKeToan
                ? "Vật tư · đơn giá (giá & SL do dự toán quy định 🔒)"
                : "Vật tư · đơn giá (sửa được, SL khoá theo dự toán)"}
            </label>
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
                    {isKeToan ? (
                      <span className="num" style={{ fontWeight: 600 }}>
                        {fmt(prices[i])}
                      </span>
                    ) : (
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
                    )}
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
