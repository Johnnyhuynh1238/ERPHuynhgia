"use client";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildVtGroups, buildSuperGroups, type VtGroup, type VtItem, type SuperGroup } from "@/lib/estimate-vt-groups";
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
  categoryName: string | null; // chủng loại (Thép, Xi măng…)
  taskCode: string | null; // "07-030"
  taskName: string | null;
};

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
  receiptImages?: ReceiptImg[]; // ảnh chứng minh nhận hàng
  receivedAt?: string | null;
  hasInflightExpense?: boolean; // đã có lệnh chi đang chờ -> khoá nút gửi
};
type ReceiptImg = { url: string; kind: "phieu" | "hang" };

type Supplier = { id: string; name: string };
type NccPrice = { id: string; materialName: string; unit: string; unitPrice: number; supplierItemCode: string | null };

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
// Đơn giá vật tư: giá thống nhất nếu mọi lần cùng giá, ngược lại bình quân theo SL.
const upriceOf = (it: VtItem) => it.uniformPrice ?? (it.qty > 0 ? it.amount / it.qty : 0);
// Khoá đã đặt theo vật tư (baseName + đvt, thường hoá chữ thường).
const itemKeyOf = (name: string, unit: string) =>
  `${baseName(name).toLowerCase()}|${unit.trim().toLowerCase()}`;
// Neo đơn theo it.key GỐC (dự toán) nếu có → KT sửa tên hàng vẫn trừ đúng dòng dự toán.
// Đơn cũ có tiền tố GĐ "NN|" → bỏ. Không có key → suy từ tên.
const orderItemKey = (it: OrderItem) => {
  const raw = (it.key || "").replace(/^\d{2}\|/, "").trim().toLowerCase();
  return raw || itemKeyOf(it.name, it.unit);
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"buy" | "cart" | "orders" | "received" | "blocks">("buy");
  const [blocks, setBlocks] = useState<Block[]>([]);
  // Giỏ hàng: mỗi VT (theo key) = { SL mua, đơn giá KT tự ghi }.
  const [cartMap, setCartMap] = useState<Record<string, { qty: number; price: number }>>({});
  // VT đang mở popup để nhập SL + giá.
  const [picked, setPicked] = useState<VtItem<Material> | null>(null);
  // Trạng thái xổ 3 siêu nhóm (mặc định thu gọn hết).
  const [openSup, setOpenSup] = useState<Record<string, boolean>>({});
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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

  // Nút "Đóng session" trong iframe chat.html báo về -> đóng popup.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== "https://huynhgia6.com") return;
      if (e.data && e.data.type === "hg-ai-closed") setAiOpen(false);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

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

  // Giỏ hàng lưu server (AI + UI chung 1 giỏ). Nạp lúc vào màn + mỗi lần mở tab Giỏ
  // để thấy hàng AI vừa bỏ vào (KT reload / chuyển tab là cập nhật).
  const loadCart = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/mua-hang/cart`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const m: Record<string, { qty: number; price: number }> = {};
      for (const it of Array.isArray(j.items) ? j.items : [])
        m[it.key] = { qty: Number(it.qty), price: Number(it.price) };
      setCartMap(m);
    } catch {
      /* giỏ lỗi → giữ giỏ hiện tại */
    }
  }, [projectId]);

  // SSO webterminal: xin cookie claude_code_session (nodejs route) lúc vào màn để iframe AI
  // (huynhgia6.com/claude) nhận diện admin/accountant — khỏi mật khẩu webterminal riêng.
  useEffect(() => {
    fetch("/api/webterminal-cookie", { credentials: "include", cache: "no-store" }).catch(() => {});
  }, []);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  useEffect(() => {
    if (tab === "cart") loadCart();
  }, [tab, loadCart]);

  // AI (popup) ghi giỏ ở server → đóng popup thì nạp lại giỏ để thấy hàng AI vừa thêm.
  // Đang mở AI thì poll nhẹ để giỏ cập nhật gần realtime.
  useEffect(() => {
    if (!aiOpen) {
      loadCart();
      return;
    }
    const t = setInterval(loadCart, 3000);
    return () => clearInterval(t);
  }, [aiOpen, loadCart]);

  // Danh mục NCC (admin+kế toán đều xem được) → combobox chọn NCC. Lỗi thì im, gõ tay như cũ.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/admin/suppliers`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        setSuppliers(
          (Array.isArray(j.suppliers) ? j.suppliers : []).map((s: { id: string; name: string }) => ({
            id: s.id,
            name: s.name,
          })),
        );
      } catch {
        /* danh mục NCC lỗi → vẫn gõ tay được */
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const mRes = await fetch(`/api/projects/${projectId}/estimate-db/materials`, { cache: "no-store" });
        if (!mRes.ok) throw new Error("Không đọc được vật tư dự toán");
        const mj = await mRes.json();
        setMaterials(mj.items || []);
        await loadOrders();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, loadOrders]);

  // ── gộp VT: chủng loại → vật tư (baseName, tổng SL) ─────────
  // Nguồn CHUNG với tab "Vật tư" của dự toán (lib/estimate-vt-groups). collapseBase=true
  // gộp bỏ phần " (vị trí công tác…)" → mỗi vật tư 1 dòng tổng SL để mua.
  const cats = useMemo<VtGroup<Material>[]>(
    () => buildVtGroups(materials, { collapseBase: true }),
    [materials],
  );
  const allItems = useMemo(() => cats.flatMap((c) => c.items), [cats]);

  const placedByItem = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    orders.forEach((o) =>
      o.items.forEach((it) => {
        const k = orderItemKey(it);
        m[k] = (m[k] || 0) + it.qty;
      }),
    );
    return m;
  }, [orders]);

  const placed = useMemo<Record<string, number>>(() => {
    const res: Record<string, number> = {};
    for (const it of allItems) res[it.key] = Math.min(placedByItem[it.key] || 0, it.qty);
    return res;
  }, [allItems, placedByItem]);

  // "Đã nhận" = đã nhận hàng (received) hoặc đã thanh toán (paid). Còn lại = chưa nhận.
  const isReceived = (s: Order["status"]) => s === "received" || s === "paid";
  const ordersPending = useMemo(() => orders.filter((o) => !isReceived(o.status)), [orders]);
  const ordersReceived = useMemo(() => orders.filter((o) => isReceived(o.status)), [orders]);

  // 3 siêu nhóm Thô/ME/Hoàn thiện (nguồn chung dự toán) cho tab Mua hàng.
  const supers = useMemo<SuperGroup<Material>[]>(() => buildSuperGroups(cats), [cats]);

  // Giỏ hàng đã chọn: VT + SL + đơn giá (KT tự ghi).
  const cartEntries = useMemo(
    () =>
      allItems
        .filter((it) => (cartMap[it.key]?.qty || 0) > 0)
        .map((it) => ({ it, qty: cartMap[it.key].qty, price: cartMap[it.key].price })),
    [allItems, cartMap],
  );
  const cart = useMemo(
    () => ({ cnt: cartEntries.length, sum: cartEntries.reduce((s, e) => s + e.qty * e.price, 0) }),
    [cartEntries],
  );

  const addToCart = (it: VtItem<Material>, qty: number, price: number) => {
    if (!(qty > 0)) return;
    const p = Math.max(0, Math.round(price));
    setCartMap((c) => ({ ...c, [it.key]: { qty, price: p } }));
    fetch(`/api/projects/${projectId}/mua-hang/cart`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: it.key, name: it.name, unit: it.unit, qty, price: p }),
    }).catch(() => {});
  };
  const removeFromCart = (key: string) => {
    setCartMap((c) => {
      const n = { ...c };
      delete n[key];
      return n;
    });
    fetch(`/api/projects/${projectId}/mua-hang/cart?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
    }).catch(() => {});
  };
  const clearCart = () => {
    setCartMap({});
    fetch(`/api/projects/${projectId}/mua-hang/cart`, { method: "DELETE" }).catch(() => {});
  };

  const summary = useMemo(() => {
    let tot = 0;
    let pl = 0;
    allItems.forEach((it) => {
      tot += it.amount;
      pl += (placed[it.key] || 0) * upriceOf(it);
    });
    return { tot, pl, remain: tot - pl, pct: tot > 0 ? Math.round((pl / tot) * 100) : 0 };
  }, [allItems, placed]);

  const createOrder = async () => {
    const items: OrderItem[] = cartEntries.map((e) => ({
      key: e.it.key,
      name: e.it.name,
      unit: e.it.unit,
      qty: e.qty,
      price: Math.round(e.price),
    }));
    if (!items.length) return;
    // NCC chọn ở bước sửa đơn (tab Đơn hàng), không chọn ở màn mua.
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
    setCartMap({});
    await loadOrders();
    setTab("orders"); // nhảy qua tab Đơn hàng để tải PO
    toast(`Đã tạo đơn #${j.seq} · ${items.length} vật tư`);
  };

  // Kế toán không được SỬA đơn đã nhận / đã thanh toán (đã ghi công nợ NCC).
  // KT mở đơn đã nhận = XEM (read-only, EditSheet tự khoá); đơn chưa nhận = sửa/nhận hàng.
  const openEdit = (o: Order) => setEditing(o);

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
      const mk = itemKeyOf(it.name, it.unit);
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
            {loading ? "…" : cats.length} chủng loại
          </span>
          <span className="d">·</span>
          <span>Bám dự toán</span>
        </div>

        {/* summary */}
        <div className="sum">
          <div className="c">
            <div className="k">Dự toán VT</div>
            <div className="v t num">{loading ? "—" : fmt(summary.tot)}</div>
            <div className="sp">{loading ? "—" : `${cats.length} chủng loại`}</div>
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
          <button type="button" className={`tab${tab === "cart" ? " on" : ""}`} onClick={() => setTab("cart")}>
            <span>🛒 Giỏ hàng</span>
            {cart.cnt > 0 && <span className="cnt">{cart.cnt}</span>}
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
                supers={supers}
                placed={placed}
                cartMap={cartMap}
                onPick={setPicked}
                openSup={openSup}
                toggleSup={(k) => setOpenSup((o) => ({ ...o, [k]: !(o[k] ?? false) }))}
              />
              <div className="foot">Bấm vật tư để xem chi tiết + thêm vào giỏ · KT tự ghi giá</div>
            </>
          ) : tab === "cart" ? (
            <CartPanel
              entries={cartEntries}
              total={cart.sum}
              onEdit={setPicked}
              onRemove={removeFromCart}
              onClear={clearCart}
              onOrder={createOrder}
            />
          ) : tab === "orders" ? (
            <OrdersList
              orders={ordersPending}
              projectId={projectId}
              onEdit={openEdit}
              onDel={delOrder}
              onPO={setPoOrder}
              emptyText="Chưa có đơn hàng nào chờ nhận."
              hideDel={(o) => isKeToan && isReceived(o.status)}
            />
          ) : (
            <OrdersList
              orders={ordersReceived}
              projectId={projectId}
              onEdit={openEdit}
              onDel={delOrder}
              onPO={setPoOrder}
              emptyText="Chưa có đơn nào đã nhận."
              hideDel={(o) => isKeToan && isReceived(o.status)}
            />
          )}
        </div>
      </div>

      {/* cart nổi — mở tab Giỏ hàng để kiểm rồi đặt */}
      <div className={`cart${cartOn ? " show" : ""}`}>
        <div className="in">
          <button type="button" className="btn ghost sm" onClick={clearCart}>
            Xoá
          </button>
          <div className="info">
            <div className="l1">{cart.cnt} vật tư trong giỏ</div>
            <div className="l2 num">
              {fmt(cart.sum)}
              <span className="u">đ</span>
            </div>
          </div>
          <button type="button" className="btn" onClick={() => setTab("cart")}>
            🛒 Xem giỏ
          </button>
        </div>
      </div>

      {/* popup vật tư: thông tin đủ + ô SL mua + đơn giá (KT tự ghi) + thêm giỏ */}
      {picked &&
        mounted &&
        createPortal(
          <VtPopup
            item={picked}
            placed={placed[picked.key] || 0}
            existing={cartMap[picked.key]}
            theme={theme}
            onClose={() => setPicked(null)}
            onAdd={(qty, price) => {
              addToCart(picked, qty, price);
              setPicked(null);
              toast(`Đã thêm ${picked.name} vào giỏ`);
            }}
            onRemove={
              cartMap[picked.key]
                ? () => {
                    removeFromCart(picked.key);
                    setPicked(null);
                  }
                : undefined
            }
          />,
          document.body,
        )}

      {/* sửa đơn */}
      {editing && (
        <EditSheet
          order={editing}
          projectId={projectId}
          suppliers={suppliers}
          theme={theme}
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
                <b>🤖 {isKeToan ? "AI mua hàng (kế toán)" : "AI đơn mua hàng"} — {projectCode}</b>
                <button type="button" className="x" onClick={() => setAiOpen(false)} aria-label="Đóng">
                  ✕
                </button>
              </div>
              <iframe
                src={`https://huynhgia6.com/claude/chat?arg=${isKeToan ? "muahangkt" : "muahang"}-${encodeURIComponent(projectCode)}`}
                title="AI mua hàng"
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

// Tab Mua hàng: 3 siêu nhóm (thu gọn), xổ ra → chọn VT → popup. Ngoài chỉ SL dự toán + đã mua.
function BuyList({
  supers,
  placed,
  cartMap,
  onPick,
  openSup,
  toggleSup,
}: {
  supers: SuperGroup<Material>[];
  placed: Record<string, number>;
  cartMap: Record<string, { qty: number; price: number }>;
  onPick: (it: VtItem<Material>) => void;
  openSup: Record<string, boolean>;
  toggleSup: (key: string) => void;
}) {
  if (!supers.length)
    return (
      <div className="empty">
        <div className="ic">📦</div>
        Dự toán chưa có vật tư nào.
      </div>
    );
  return (
    <div className="buys">
      {supers.map((sg) => {
        const isOpen = openSup[sg.key] ?? false; // mặc định thu gọn
        const vtCount = sg.groups.reduce((s, g) => s + g.items.length, 0);
        return (
          <div className="sup" key={sg.key}>
            <button type="button" className="suphd" onClick={() => toggleSup(sg.key)} aria-expanded={isOpen}>
              <span className={"sc" + (isOpen ? " open" : "")}>▸</span>
              <span className="sl">{sg.label}</span>
              <span className="sm">{vtCount} vật tư</span>
              <span className="sv num">{fmt(sg.amount)} đ</span>
            </button>
            {isOpen &&
              sg.groups.map((g) => (
                <div key={g.key} className="catgrp">
                  <div className="cathd">
                    <span className="cn">{g.categoryName ?? "Chưa phân loại"}</span>
                  </div>
                  {g.items.map((it) => {
                    const pl = placed[it.key] || 0;
                    const inCart = cartMap[it.key]?.qty || 0;
                    return (
                      <button
                        type="button"
                        key={it.key}
                        className={"vtrow" + (inCart > 0 ? " incart" : "")}
                        onClick={() => onPick(it)}
                      >
                        <span className="rn">{it.name}</span>
                        <span className="nums">
                          <span>
                            DT <b>{fmtQ(it.qty)}</b> {it.unit}
                          </span>
                          <span className="done">
                            Đã mua <b>{fmtQ(pl)}</b>
                          </span>
                        </span>
                        {inCart > 0 && <span className="cbadge">Giỏ {fmtQ(inCart)}</span>}
                        <span className="chev">›</span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}

// Popup 1 vật tư: thông tin đủ + ô SL mua + đơn giá (KT tự ghi) + thêm giỏ.
function VtPopup({
  item,
  placed,
  existing,
  theme,
  onClose,
  onAdd,
  onRemove,
}: {
  item: VtItem<Material>;
  placed: number;
  existing?: { qty: number; price: number };
  theme: "light" | "dark";
  onClose: () => void;
  onAdd: (qty: number, price: number) => void;
  onRemove?: () => void;
}) {
  const suggest = Math.round(upriceOf(item));
  const [qty, setQtyS] = useState<string>(existing ? String(existing.qty) : "");
  const [price, setPriceS] = useState<string>(String(existing ? existing.price : suggest));
  const rem = item.qty - placed;
  const q = parseFloat(qty) || 0;
  const p = parseFloat(price) || 0;
  const tasks = Array.from(new Set(item.members.map((m) => m.taskName).filter(Boolean)));
  return (
    <div className="vt-scrim" data-theme={theme} onClick={onClose}>
      <div className="vt-box" onClick={(e) => e.stopPropagation()}>
        <div className="vt-hd">
          <div className="vt-nm">{item.name}</div>
          <button type="button" className="x" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="vt-info">
          <div className="kv"><span>Đơn vị</span><b>{item.unit}</b></div>
          <div className="kv"><span>SL dự toán</span><b>{fmtQ(item.qty)} {item.unit}</b></div>
          <div className="kv"><span>Đã mua</span><b>{fmtQ(placed)} {item.unit}</b></div>
          <div className="kv"><span>Còn lại dự toán</span><b>{fmtQ(rem > 0 ? rem : 0)} {item.unit}</b></div>
          <div className="kv"><span>Đơn giá dự toán</span><b>{fmt(suggest)} đ</b></div>
          {tasks.length > 0 && (
            <div className="kv"><span>Công tác</span><b className="tsk">{tasks.join(", ")}</b></div>
          )}
        </div>
        <div className="vt-form">
          <label className="fld">
            <div className="fld-hd">
              <span>SL mua</span>
              {rem > 0.0001 && (
                <button type="button" className="fill" onClick={() => setQtyS(String(Math.round(rem * 1000) / 1000))}>
                  = còn {fmtQ(rem)}
                </button>
              )}
            </div>
            <div className="inrow">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={qty}
                placeholder="0"
                autoFocus
                onChange={(e) => setQtyS(e.target.value)}
              />
              <span className="u">{item.unit}</span>
            </div>
          </label>
          <label className="fld">
            <div className="fld-hd">
              <span>Đơn giá</span>
            </div>
            <div className="inrow">
              <input
                type="number"
                inputMode="numeric"
                step="any"
                min="0"
                value={price}
                placeholder="0"
                onChange={(e) => setPriceS(e.target.value)}
              />
              <span className="u">đ</span>
            </div>
          </label>
        </div>
        <div className="vt-tt">
          Thành tiền <b className="num">{fmt(q * p)} đ</b>
        </div>
        <div className="vt-acts">
          {onRemove && (
            <button type="button" className="btn ghost" onClick={onRemove}>
              Xoá khỏi giỏ
            </button>
          )}
          <button type="button" className="btn" disabled={!(q > 0)} onClick={() => onAdd(q, p)}>
            {existing ? "Cập nhật giỏ" : "🛒 Thêm vào giỏ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tab Giỏ hàng: kiểm lại rồi Đặt hàng → tạo 1 đơn.
function CartPanel({
  entries,
  total,
  onEdit,
  onRemove,
  onClear,
  onOrder,
}: {
  entries: { it: VtItem<Material>; qty: number; price: number }[];
  total: number;
  onEdit: (it: VtItem<Material>) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  onOrder: () => void;
}) {
  if (!entries.length)
    return (
      <div className="empty">
        <div className="ic">🛒</div>
        Giỏ trống. Qua tab Mua hàng chọn vật tư.
      </div>
    );
  return (
    <div className="cartpanel">
      {entries.map((e) => (
        <div key={e.it.key} className="crow">
          <button type="button" className="cmain" onClick={() => onEdit(e.it)}>
            <span className="nm">{e.it.name}</span>
            <span className="sub">
              {fmtQ(e.qty)} {e.it.unit} × {fmt(e.price)} đ
            </span>
          </button>
          <span className="ct num">{fmt(e.qty * e.price)} đ</span>
          <button type="button" className="crm" onClick={() => onRemove(e.it.key)} aria-label="Xoá">
            ✕
          </button>
        </div>
      ))}
      <div className="ctot">
        <span>Tổng {entries.length} vật tư</span>
        <b className="num">{fmt(total)} đ</b>
      </div>
      <div className="cacts">
        <button type="button" className="btn ghost" onClick={onClear}>
          Xoá giỏ
        </button>
        <button type="button" className="btn" onClick={onOrder}>
          Đặt hàng →
        </button>
      </div>
    </div>
  );
}

// Đơn "trả ngay" = đã nhận, KHÔNG có NCC (đơn có NCC đã ghi công nợ → trả ở màn Công nợ).
// Chỉ đơn này mới mở lệnh chi. Đơn đã "paid" thì thôi (tránh chi trùng).
const canPayNow = (o: Order) => o.status === "received" && !(o.supplierName && o.supplierName.trim());
// Mở màn Lệnh chi (/expenses) với số + nội dung điền sẵn — admin/kế toán bấm xác nhận thủ công.
const goLenhChi = (projectId: string, o: Order) => {
  const note = `Mua hàng trả ngay — Đơn #${o.seq}${o.items.length ? ` (${o.items.length} vật tư)` : ""}`;
  const qs = new URLSearchParams({
    create: "1",
    projectId,
    amount: String(Math.round(o.total || 0)),
    method: "cash",
    note,
    categoryCode: "VATTU", // danh mục điền sẵn "Vật tư" (admin đổi được)
    sourceType: "mua_hang_order",
    sourceId: o.id,
  });
  window.location.href = `/expenses?${qs.toString()}`;
};

function OrdersList({
  orders,
  projectId,
  onEdit,
  onDel,
  onPO,
  emptyText,
  hideDel,
}: {
  orders: Order[];
  projectId: string;
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
            {canPayNow(o) &&
              (o.hasInflightExpense ? (
                <span className="linkbtn sent" title="Đã có lệnh chi đang chờ kế toán/admin xử lý">
                  ⏳ Đã gửi lệnh chi
                </span>
              ) : (
                <button type="button" className="linkbtn pay" onClick={() => goLenhChi(projectId, o)}>
                  🧾 Gửi lệnh chi
                </button>
              ))}
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

// 1 nhóm ảnh nhận hàng (phiếu / hàng). Ảnh mới có preview; ảnh đã lưu hiện qua serve route theo index.
function ReceiptGroup({
  label,
  kind,
  ok,
  need,
  readOnly,
  busy,
  items,
  projectId,
  orderId,
  onUpload,
  onRemove,
}: {
  label: string;
  kind: "phieu" | "hang";
  ok: boolean;
  need: boolean;
  readOnly: boolean;
  busy: boolean;
  items: { url: string; kind: "phieu" | "hang"; preview?: string }[];
  projectId: string;
  orderId: string;
  onUpload: (f: File) => void;
  onRemove: (idx: number) => void;
}) {
  const inpRef = useRef<HTMLInputElement>(null);
  const mine = items.map((r, i) => ({ r, i })).filter((x) => x.r.kind === kind);
  const srcOf = (r: { preview?: string }, i: number) =>
    r.preview || `/api/projects/${projectId}/mua-hang/${orderId}/receipt/${i}/file`;
  return (
    <div className={`rg${need && !ok ? " miss" : ""}${ok ? " done" : ""}`}>
      <div className="rg-hd">
        <span>
          {label}
          {need && " *"}
        </span>
        {ok && <span className="rg-ok">✓</span>}
      </div>
      <div className="rg-imgs">
        {mine.map(({ r, i }) => (
          <div className="rg-im" key={i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={srcOf(r, i)} alt={label} />
            {!readOnly && (
              <button type="button" className="rg-rm" onClick={() => onRemove(i)} aria-label="Xoá ảnh">
                ✕
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button type="button" className="rg-add" onClick={() => inpRef.current?.click()} disabled={busy}>
            {busy ? "…" : "+ Ảnh"}
          </button>
        )}
        {readOnly && mine.length === 0 && <span className="rg-empty">—</span>}
      </div>
      <input
        ref={inpRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function EditSheet({
  order,
  onClose,
  onSaved,
  projectId,
  suppliers,
  theme,
  isKeToan,
}: {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
  projectId: string;
  suppliers: Supplier[];
  theme: "light" | "dark";
  isKeToan: boolean;
}) {
  // KT xem đơn đã nhận = chỉ đọc. Admin luôn sửa được.
  const readOnly = isKeToan && (order.status === "received" || order.status === "paid");
  const [show, setShow] = useState(false);
  const [supplierName, setSupplierName] = useState(order.supplierName || "");
  const [orderDate, setOrderDate] = useState(order.orderDate ? order.orderDate.slice(0, 10) : "");
  const [deliveryDate, setDeliveryDate] = useState(order.deliveryDate ? order.deliveryDate.slice(0, 10) : "");
  const [status, setStatus] = useState<Order["status"]>(order.status);
  const [note, setNote] = useState(order.note || "");
  // Bản sao vật tư để sửa tên/đvt/SL/đơn giá (KT + admin đều được, không thêm/bớt dòng).
  const [items, setItems] = useState<OrderItem[]>(order.items.map((it) => ({ ...it })));
  // Bảng giá hàng của NCC đang chọn → droplist "hàng theo NCC" + tự điền đơn giá.
  const [nccPrices, setNccPrices] = useState<NccPrice[]>([]);
  const [saving, setSaving] = useState(false);

  // Ảnh chứng minh nhận hàng. Ảnh cũ (đã lưu) hiện qua serve route theo index; ảnh mới có preview.
  const [receipts, setReceipts] = useState<{ url: string; kind: "phieu" | "hang"; preview?: string }[]>(
    () => (order.receiptImages || []).map((r) => ({ url: r.url, kind: r.kind })),
  );
  const [upBusy, setUpBusy] = useState<"phieu" | "hang" | null>(null);

  const uploadReceipt = async (file: File, kind: "phieu" | "hang") => {
    setUpBusy(kind);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const r = await fetch(`/api/projects/${projectId}/mua-hang/${order.id}/receipt-photo`, {
      method: "POST",
      body: fd,
    });
    setUpBusy(null);
    if (r.ok) {
      const j = await r.json();
      setReceipts((a) => [...a, { url: j.url, kind: j.kind, preview: URL.createObjectURL(file) }]);
    } else {
      const j = await r.json().catch(() => ({}));
      alert(j.message || "Upload ảnh lỗi");
    }
  };
  const removeReceipt = (idx: number) => setReceipts((a) => a.filter((_, i) => i !== idx));

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Đổi NCC → tải bảng giá hàng của NCC đó (nếu khớp tên trong danh mục).
  const supplierId = suppliers.find((s) => s.name.trim().toLowerCase() === supplierName.trim().toLowerCase())?.id ?? null;
  useEffect(() => {
    if (!supplierId) {
      setNccPrices([]);
      return;
    }
    let alive = true;
    fetch(`/api/admin/suppliers/${supplierId}/prices`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { prices: [] }))
      .then((j) => {
        if (alive) setNccPrices(Array.isArray(j.prices) ? j.prices : []);
      })
      .catch(() => alive && setNccPrices([]));
    return () => {
      alive = false;
    };
  }, [supplierId]);

  const total = items.reduce((s, it) => s + it.qty * (it.price || 0), 0);

  // Đang chuyển sang "đã nhận" (chưa nhận trước đó). KT phải đủ ảnh phiếu + ảnh hàng.
  const receiving = status === "received" && order.status !== "received" && order.status !== "paid";
  const needProof = isKeToan && receiving;
  const hasPhieu = receipts.some((r) => r.kind === "phieu");
  const hasHang = receipts.some((r) => r.kind === "hang");
  const proofOk = !needProof || (hasPhieu && hasHang);

  // Sửa 1 dòng; nếu đổi "tên" khớp hàng trong bảng giá NCC → tự điền đvt + đơn giá.
  const patchItem = (i: number, patch: Partial<OrderItem>) => {
    setItems((arr) =>
      arr.map((it, j) => {
        if (j !== i) return it;
        const next = { ...it, ...patch };
        if (patch.name != null) {
          const hit = nccPrices.find((p) => p.materialName.trim().toLowerCase() === patch.name!.trim().toLowerCase());
          if (hit) {
            next.price = Math.round(hit.unitPrice);
            if (hit.unit) next.unit = hit.unit;
          }
        }
        return next;
      }),
    );
  };

  const save = async () => {
    setSaving(true);
    const r = await fetch(`/api/projects/${projectId}/mua-hang/${order.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        supplierName,
        supplierId,
        orderDate: orderDate ? new Date(orderDate).toISOString() : undefined,
        deliveryDate: deliveryDate || null,
        status,
        note,
        items,
        receiptImages: receipts.map((r) => ({ url: r.url, kind: r.kind })),
      }),
    });
    setSaving(false);
    if (r.ok) onSaved();
    else {
      const j = await r.json().catch(() => ({}));
      alert(j.message || "Lưu đơn lỗi");
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`mhdoc mhp ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
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
          <fieldset className="efs" disabled={readOnly}>
          <div className="fld">
            <label>Nhà cung cấp (NCC)</label>
            <input
              list="mh-ncc-edit"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Chọn hoặc gõ tên NCC / cửa hàng"
            />
            <datalist id="mh-ncc-edit">
              {suppliers.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
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
          <div className="fld fldw">
            <label>Ghi chú</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Điều kiện giao, thanh toán, phụ kiện..."
              rows={2}
            />
          </div>
          <div className="fld fldw">
            <label>Vật tư — tên · SL · đơn giá (sửa theo thực tế mua)</label>
            <datalist id="mh-hang-ncc">
              {nccPrices.map((p) => (
                <option key={p.id} value={p.materialName}>
                  {fmt(p.unitPrice)} đ/{p.unit}
                </option>
              ))}
            </datalist>
            <div className="eitems">
              {items.map((it, i) => (
                <div key={it.key || i} className="eitr">
                  <input
                    className="ein-name"
                    list="mh-hang-ncc"
                    value={it.name}
                    onChange={(e) => patchItem(i, { name: e.target.value })}
                    placeholder="Tên hàng (chọn theo NCC hoặc gõ tay)"
                  />
                  <div className="ein-row">
                    <div className="ein-qty">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={it.qty || ""}
                        onChange={(e) => patchItem(i, { qty: parseFloat(e.target.value) || 0 })}
                      />
                      <span className="u">{it.unit}</span>
                    </div>
                    <span className="ein-x">×</span>
                    <div className="ein-price">
                      <input
                        type="number"
                        inputMode="numeric"
                        step="any"
                        min="0"
                        value={it.price || ""}
                        onChange={(e) => patchItem(i, { price: Math.round(parseFloat(e.target.value) || 0) })}
                      />
                      <span className="u">đ</span>
                    </div>
                    <span className="ein-sum num">{fmt(it.qty * (it.price || 0))}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="etot">
              <span className="k">Tổng đơn</span>
              <span className="v num">{fmt(total)} đ</span>
            </div>
          </div>
          </fieldset>

          {(receiving || (order.receiptImages && order.receiptImages.length > 0)) && (
            <div className="rcpt">
              <div className="rcpt-hd">
                <span>📸 Ảnh nhận hàng</span>
                {needProof && <span className="rq">cần đủ phiếu + ảnh hàng</span>}
              </div>
              <div className="rcpt-grp">
                <ReceiptGroup
                  label="Phiếu nhận hàng"
                  kind="phieu"
                  ok={hasPhieu}
                  need={needProof}
                  readOnly={readOnly || !receiving}
                  busy={upBusy === "phieu"}
                  items={receipts}
                  projectId={projectId}
                  orderId={order.id}
                  onUpload={(f) => uploadReceipt(f, "phieu")}
                  onRemove={removeReceipt}
                />
                <ReceiptGroup
                  label="Ảnh hàng thực tế"
                  kind="hang"
                  ok={hasHang}
                  need={needProof}
                  readOnly={readOnly || !receiving}
                  busy={upBusy === "hang"}
                  items={receipts}
                  projectId={projectId}
                  orderId={order.id}
                  onUpload={(f) => uploadReceipt(f, "hang")}
                  onRemove={removeReceipt}
                />
              </div>
            </div>
          )}

          <div className="sactions">
            <button type="button" className="btn ghost" onClick={onClose}>
              {readOnly ? "Đóng" : "Huỷ"}
            </button>
            {!readOnly && (
              <button type="button" className="btn" onClick={save} disabled={saving || !proofOk}>
                {saving ? "Đang lưu…" : receiving ? "Xác nhận đã nhận" : "Lưu đơn"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
