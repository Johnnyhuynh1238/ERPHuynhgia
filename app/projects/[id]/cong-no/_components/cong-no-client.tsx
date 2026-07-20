"use client";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { SubContractsTab } from "./sub-tab";
import "./cong-no.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

// ── kiểu dữ liệu ──────────────────────────────────────────────
type OrderItem = { key: string; name: string; unit: string; qty: number; price: number };
type Order = {
  id: string;
  seq: number;
  status: "draft" | "ordered" | "received" | "paid";
  supplierId: string | null;
  supplierName: string | null;
  orderDate: string;
  deliveryDate: string | null;
  note: string | null;
  total: number;
  items: OrderItem[];
};
type Payment = { id: string; soTien: number; ngay: string; ghiChu: string | null };
type Supplier = {
  supplierId: string;
  supplierName: string;
  phone: string | null;
  bankName: string | null;
  bankAccount: string | null;
  tongNo: number;
  daTra: number;
  conLai: number;
  orderCount: number;
  orders: Order[];
  payments: Payment[];
  hasInflightExpense?: boolean; // đã có lệnh chi đang chờ -> khoá nút gửi
};
type Account = { id: string; code: string; name: string; kind: string; currentBalance: number };
type Data = { summary: { tongNo: number; daTra: number; conLai: number }; suppliers: Supplier[]; accounts: Account[] };

// Đơn NCC: không mark "đã thanh toán". received = "Đã ghi công nợ" = hết quy trình.
// Trong công nợ đơn chỉ để XEM (read-only).
const fmt = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");
const fmtQ = (n: number) =>
  Math.abs(n - Math.round(n)) < 1e-9
    ? Math.round(n).toLocaleString("vi-VN")
    : n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${`0${d.getDate()}`.slice(-2)}/${`0${d.getMonth() + 1}`.slice(-2)}/${d.getFullYear()}`;
};
const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function CongNoClient({
  projectId,
  projectCode,
  projectName,
  canManageSub = false,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  canManageSub?: boolean;
}) {
  const [tab, setTab] = useState<"ncc" | "sub">("ncc");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openSid, setOpenSid] = useState<string | null>(null);
  const [editing, setEditing] = useState<Order | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
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
    const saved = localStorage.getItem("congno-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);
  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("congno-theme", next);
      return next;
    });

  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/cong-no`, { cache: "no-store" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || "Không đọc được công nợ");
    }
    return (await r.json()) as Data;
  }, [projectId]);

  useEffect(() => {
    (async () => {
      try {
        setData(await load());
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const sum = data?.summary ?? { tongNo: 0, daTra: 0, conLai: 0 };
  const suppliers = data?.suppliers ?? [];
  const openSup = useMemo(() => suppliers.find((s) => s.supplierId === openSid) || null, [suppliers, openSid]);

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
    }<br><b>Trạng thái:</b> Đã ghi công nợ</div></div>
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

  return (
    <div className={`cndoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="wrap">
        {/* topbar */}
        <div className="topbar">
          <div className="brand">
            <div className="mark">H6</div>
            <div>
              <b>HUỲNH GIA</b>
              <span>Quản lý NCC</span>
            </div>
          </div>
          <div className="topacts">
            <Link href={`/projects/${projectId}`} className="cnback">
              ← Dự án
            </Link>
            <button type="button" className="iconbtn ai" onClick={() => setAiOpen(true)} title="AI công nợ">
              🤖
            </button>
            <button type="button" className="iconbtn" onClick={toggleTheme} aria-label="Sáng/tối">
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </div>

        <div className="eyebrow">Quản lý NCC · {projectCode}</div>
        <h1>{projectName}</h1>

        {/* tab menu ngang: Công nợ NCC | Thầu phụ */}
        <div className="cntabs" role="tablist">
          <button type="button" role="tab" className={`cntab${tab === "ncc" ? " on" : ""}`} onClick={() => setTab("ncc")}>
            Công nợ NCC
          </button>
          <button type="button" role="tab" className={`cntab${tab === "sub" ? " on" : ""}`} onClick={() => setTab("sub")}>
            Thầu phụ
          </button>
        </div>

        {tab === "sub" ? (
          <SubContractsTab projectId={projectId} canManage={canManageSub} />
        ) : (
        <>
        <div className="meta">
          <span>{loading ? "…" : `${suppliers.length} NCC`}</span>
          <span className="d">·</span>
          <span>Từ đơn đã ghi công nợ</span>
        </div>

        {/* summary */}
        <div className="sum">
          <div className="c">
            <div className="k">Tổng nợ</div>
            <div className="v t num">{loading ? "—" : fmt(sum.tongNo)}</div>
            <div className="sp">đã ghi công nợ</div>
          </div>
          <div className="c">
            <div className="k">Đã trả</div>
            <div className="v o num">{loading ? "—" : fmt(sum.daTra)}</div>
            <div className="sp">đã thanh toán NCC</div>
          </div>
          <div className="c">
            <div className="k">Còn lại</div>
            <div className="v r num">{loading ? "—" : fmt(sum.conLai)}</div>
            <div className="sp">còn phải trả</div>
          </div>
        </div>

        {/* danh sách NCC */}
        <div className="seclabel">Nhà cung cấp</div>
        {loading ? (
          <div className="load">Đang tải công nợ…</div>
        ) : err ? (
          <div className="empty">{err}</div>
        ) : !suppliers.length ? (
          <div className="empty">
            <div className="ic">🧾</div>
            Chưa có công nợ NCC.
            <br />
            Đơn mua hàng đánh dấu &quot;Đã ghi công nợ&quot; sẽ hiện ở đây.
          </div>
        ) : (
          <div className="nlist">
            {suppliers.map((s) => {
              const off = s.conLai <= 0.0001;
              return (
                <button key={s.supplierId} type="button" className={`nccrow${off ? " paidoff" : ""}`} onClick={() => setOpenSid(s.supplierId)}>
                  <div className="nl">
                    <div className="nn">{s.supplierName}</div>
                    <div className="nsub">
                      <span>{s.orderCount} đơn</span>
                      {s.phone && <span>· {s.phone}</span>}
                      <span>· Nợ {fmt(s.tongNo)}</span>
                      {s.daTra > 0 && <span>· Trả {fmt(s.daTra)}</span>}
                    </div>
                  </div>
                  <div className="nr">
                    <div className="rv num">{fmt(s.conLai)}</div>
                    <div className="rk">{off ? "đã tất toán" : "còn nợ"}</div>
                  </div>
                  <span className="chev">›</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="foot">Công nợ bám đơn mua hàng · Đúng — Đẹp — Bền</div>
        </>
        )}
      </div>

      {/* popup NCC giữa màn */}
      {openSup && (
        <NccPopup
          key={openSup.supplierId}
          sup={openSup}
          projectId={projectId}
          onClose={() => setOpenSid(null)}
          onEditOrder={setEditing}
          onPO={downloadPO}
        />
      )}

      {/* xem đơn — chỉ đọc (đã ghi công nợ = xong quy trình) */}
      {editing && <ViewSheet order={editing} onClose={() => setEditing(null)} onPO={downloadPO} />}

      {/* AI drawer — portal ra body */}
      {aiOpen &&
        mounted &&
        createPortal(
          <div className="cn-ai-scrim" onClick={() => setAiOpen(false)}>
            <div className="cn-ai-box" onClick={(e) => e.stopPropagation()}>
              <div className="cn-ai-head">
                <b>🤖 AI công nợ NCC — {projectCode}</b>
                <button type="button" className="x" onClick={() => setAiOpen(false)} aria-label="Đóng">
                  ✕
                </button>
              </div>
              <iframe
                src={`https://huynhgia6.com/claude/chat?arg=muahang-${encodeURIComponent(projectCode)}`}
                title="AI công nợ NCC"
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function NccPopup({
  sup,
  projectId,
  onClose,
  onEditOrder,
  onPO,
}: {
  sup: Supplier;
  projectId: string;
  onClose: () => void;
  onEditOrder: (o: Order) => void;
  onPO: (o: Order) => void;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const off = sup.conLai <= 0.0001;

  // Mở màn Lệnh chi điền sẵn số còn phải trả (admin/KT sửa được). Chi xong → tự ghi trả công nợ NCC.
  const goLenhChi = () => {
    const bank = sup.bankAccount ? ` — ${sup.bankName || ""} ${sup.bankAccount}`.trim() : "";
    const qs = new URLSearchParams({
      create: "1",
      projectId,
      amount: String(Math.round(sup.conLai || 0)),
      method: "transfer",
      payee: sup.supplierName,
      note: `Trả công nợ NCC ${sup.supplierName}${bank}`,
      sourceType: "ncc_congno",
      sourceId: sup.supplierId,
    });
    window.location.href = `/expenses?${qs.toString()}`;
  };

  return (
    <div className={`npop-scrim${show ? " show" : ""}`} onClick={onClose}>
      <div className="npop" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="nph">
          <div className="ht">
            <div className="he">Nhà cung cấp</div>
            <div className="hn">{sup.supplierName}</div>
            <div className="hs">
              {sup.orderCount} đơn đã ghi công nợ
              {sup.phone ? ` · ${sup.phone}` : ""}
              {sup.bankAccount ? ` · ${sup.bankName || ""} ${sup.bankAccount}` : ""}
            </div>
          </div>
          <button type="button" className="xclose" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="npie">
          <div className="c">
            <div className="k">Tổng nợ</div>
            <div className="v t num">{fmt(sup.tongNo)}</div>
          </div>
          <div className="c">
            <div className="k">Đã trả</div>
            <div className="v o num">{fmt(sup.daTra)}</div>
          </div>
          <div className="c">
            <div className="k">Còn lại</div>
            <div className={`v ${off ? "o" : "r"} num`}>{fmt(sup.conLai)}</div>
          </div>
        </div>

        {!off && (
          <div className="npay">
            {sup.hasInflightExpense ? (
              <div className="sent" title="Đã có lệnh chi đang chờ kế toán/admin xử lý">
                ⏳ Đã gửi lệnh chi — chờ xử lý
              </div>
            ) : (
              <button type="button" className="btn pay" onClick={goLenhChi}>
                🧾 Gửi lệnh chi trả NCC
              </button>
            )}
          </div>
        )}

        <div className="nbody">
          {sup.payments.length > 0 && (
            <>
              <div className="blbl">Lịch sử thanh toán</div>
              <div className="payhist">
                {sup.payments.map((p) => (
                  <div key={p.id} className="ph">
                    <span className="phd">{fmtDate(p.ngay)}</span>
                    <span className="phn">{p.ghiChu || "Trả công nợ"}</span>
                    <span className="phv num">{fmt(p.soTien)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="blbl">Đơn đã ghi công nợ</div>
          {sup.orders.map((o) => (
            <div key={o.id} className="ord-card" onClick={() => onEditOrder(o)}>
              <div className="oh">
                <span className="on">Đơn #{o.seq}</span>
                <span className="chip debt">Đã ghi công nợ</span>
              </div>
              <div className="sup">{fmtDate(o.orderDate)} · nhận {fmtDate(o.deliveryDate) || "—"}</div>
              <div className="ov num">
                {fmt(o.total)} đ<span className="cnt2">{o.items.length} vật tư</span>
              </div>
              <div className="oact" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="linkbtn" onClick={() => onPO(o)}>
                  ⭳ Tải PO
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ViewSheet({ order, onClose, onPO }: { order: Order; onClose: () => void; onPO: (o: Order) => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <>
      <div className={`scrim${show ? " show" : ""}`} onClick={onClose} />
      <div className={`sheet${show ? " show" : ""}`} role="dialog" aria-modal="true">
        <div className="grip" />
        <div className="shead">
          <div>
            <div className="se">Đơn đặt hàng · chỉ xem</div>
            <div className="st">Đơn #{order.seq}</div>
          </div>
          <button type="button" className="xclose" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="sbody">
          <div className="vgrid">
            <div className="vf">
              <span className="vk">Nhà cung cấp</span>
              <span className="vv">{order.supplierName || "—"}</span>
            </div>
            <div className="vf">
              <span className="vk">Trạng thái</span>
              <span className="chip debt">Đã ghi công nợ</span>
            </div>
            <div className="vf">
              <span className="vk">Ngày đặt</span>
              <span className="vv num">{fmtDate(order.orderDate) || "—"}</span>
            </div>
            <div className="vf">
              <span className="vk">Ngày nhận</span>
              <span className="vv num">{fmtDate(order.deliveryDate) || "—"}</span>
            </div>
          </div>
          {order.note && (
            <div className="vnote">
              <span className="vk">Ghi chú</span>
              <div>{order.note}</div>
            </div>
          )}
          <div className="fld">
            <label>Vật tư trong đơn</label>
            <div className="eitems">
              {order.items.map((it) => (
                <div key={it.key} className="eit ro">
                  <div className="en">
                    {it.name}
                    <div className="eq">
                      {fmtQ(it.qty)} {it.unit} × {fmt(it.price)} đ
                    </div>
                  </div>
                  <div className="epv num">{fmt(it.qty * it.price)} đ</div>
                </div>
              ))}
            </div>
            <div className="etot">
              <span className="k">Tổng đơn</span>
              <span className="v num">{fmt(order.total)} đ</span>
            </div>
          </div>
          <div className="sactions">
            <button type="button" className="btn ghost" onClick={() => onPO(order)}>
              ⭳ Tải PO
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
