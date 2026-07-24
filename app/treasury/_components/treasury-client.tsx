"use client";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { SwipeLightbox } from "@/components/swipe-lightbox";
import "./so-quy.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

type ProjectOption = { id: string; code: string; name: string };
type CategoryOption = { id: string; code: string; name: string; scope: string | null };

type AccountSummary = {
  id: string;
  code: string;
  name: string;
  kind: "cash" | "bank";
  currentBalance: number;
};

type Summary = {
  initialized: boolean;
  currentBalance: number;
  openingBalance: number;
  openingDate: string | null;
  openingNote: string | null;
  openingSetAt: string | null;
  openingSetBy: { id: string; fullName: string } | null;
  lastTxnAt: string | null;
  pendingExpenseTotal: number;
  pendingExpenseCount: number;
  accounts: AccountSummary[];
};

type TxnAccount = { id: string; code: string; name: string; kind: "cash" | "bank" };

type Txn = {
  id: string;
  direction: "in" | "out";
  amount: number;
  occurredAt: string;
  balanceAfter: number;
  refType: "opening" | "expense" | "sub_payment" | "material_proposal" | "payment_schedule" | "receipt" | "transfer";
  refId: string | null;
  note: string | null;
  createdAt: string;
  project: ProjectOption | null;
  category: CategoryOption | null;
  creator: { id: string; fullName: string };
  account: TxnAccount | null;
  counterAccount: TxnAccount | null;
  attachments: { url: string; isImage: boolean }[];
};

const fmt = (n: number | null | undefined) => Math.round(n || 0).toLocaleString("vi-VN");
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtDateTime(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${fmtDate(s)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const REFTYPE_LABEL: Record<Txn["refType"], string> = {
  opening: "Khởi tạo",
  expense: "Lệnh chi",
  sub_payment: "TT thầu phụ",
  material_proposal: "Đề xuất vật tư",
  payment_schedule: "Thu chủ nhà",
  receipt: "Lệnh thu",
  transfer: "Chuyển quỹ",
};
const ACCOUNT_KIND_LABEL: Record<"cash" | "bank", string> = { cash: "Tiền mặt", bank: "Ngân hàng" };

export function TreasuryClient({
  projects,
  categories,
}: {
  projects: ProjectOption[];
  categories: CategoryOption[];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tiendo-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* ignore */
    }
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("tiendo-theme", next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Txn[]>([]);
  const [totals, setTotals] = useState<{ in: number; out: number }>({ in: 0, out: 0 });
  const [loading, setLoading] = useState(true);

  const [direction, setDirection] = useState("");
  const [refType, setRefType] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;
  const [showFilters, setShowFilters] = useState(false);

  const [selectedTxn, setSelectedTxn] = useState<Txn | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [catValue, setCatValue] = useState("");
  const [catSaving, setCatSaving] = useState(false);

  useEffect(() => setCatValue(selectedTxn?.category?.id ?? ""), [selectedTxn]);
  const imgAtts = selectedTxn ? selectedTxn.attachments.filter((a) => a.isImage) : [];

  // Danh mục sửa trong sổ quỹ lọc theo ngữ cảnh giao dịch: có dự án → scope "project";
  // chung công ty → scope "company". Giữ thêm danh mục đang gán nếu ngoài scope.
  const editCatOptions = useMemo(() => {
    const sc: "project" | "company" = selectedTxn?.project ? "project" : "company";
    const inScope = categories.filter((c) => c.scope === sc);
    const cur = categories.find((c) => c.id === selectedTxn?.category?.id);
    return cur && !inScope.some((c) => c.id === cur.id) ? [cur, ...inScope] : inScope;
  }, [categories, selectedTxn]);

  const [showTransfer, setShowTransfer] = useState(false);
  const [trFrom, setTrFrom] = useState("");
  const [trTo, setTrTo] = useState("");
  const [trAmount, setTrAmount] = useState("");
  const [trDate, setTrDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [trNote, setTrNote] = useState("");
  const [trSaving, setTrSaving] = useState(false);

  const hasActiveFilter = !!(direction || refType || projectFilter || categoryFilter || accountFilter || from || to);

  const filterQs = useMemo(() => {
    const qs = new URLSearchParams();
    if (direction) qs.set("direction", direction);
    if (refType) qs.set("refType", refType);
    if (projectFilter) qs.set("projectId", projectFilter);
    if (categoryFilter) qs.set("categoryId", categoryFilter);
    if (accountFilter) qs.set("accountId", accountFilter);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    return qs;
  }, [direction, refType, projectFilter, categoryFilter, accountFilter, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    const [sRes, tRes] = await Promise.all([
      fetch("/api/treasury/summary", { cache: "no-store" }),
      fetch(`/api/treasury/transactions?${filterQs.toString()}&page=${page}&pageSize=${pageSize}`, { cache: "no-store" }),
    ]);
    const sJson = await sRes.json().catch(() => ({}));
    const tJson = await tRes.json().catch(() => ({}));
    setLoading(false);
    if (!sRes.ok) {
      toast.error(sJson.message || "Không tải được số dư");
      return;
    }
    if (!tRes.ok) {
      toast.error(tJson.message || "Không tải được nhật ký quỹ");
      return;
    }
    setSummary(sJson);
    setRows(tJson.rows || []);
    setTotal(tJson.total || 0);
    setTotals(tJson.totals || { in: 0, out: 0 });
  }, [filterQs, page]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => setPage(1), [direction, refType, projectFilter, categoryFilter, accountFilter, from, to]);

  function reset() {
    setDirection("");
    setRefType("");
    setProjectFilter("");
    setCategoryFilter("");
    setAccountFilter("");
    setFrom("");
    setTo("");
  }

  async function submitTransfer() {
    if (!trFrom || !trTo) {
      toast.error("Chọn tài khoản nguồn và đích");
      return;
    }
    if (trFrom === trTo) {
      toast.error("Tài khoản nguồn và đích phải khác nhau");
      return;
    }
    const amt = Number(trAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Nhập số tiền > 0");
      return;
    }
    setTrSaving(true);
    const res = await fetch("/api/treasury/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAccountId: trFrom, toAccountId: trTo, amount: amt, occurredAt: trDate, note: trNote || null }),
    });
    const json = await res.json().catch(() => ({}));
    setTrSaving(false);
    if (!res.ok) {
      toast.error(json.message || "Chuyển quỹ thất bại");
      return;
    }
    toast.success("Đã chuyển quỹ");
    setShowTransfer(false);
    setTrFrom("");
    setTrTo("");
    setTrAmount("");
    setTrNote("");
    await load();
  }

  async function saveCategory() {
    if (!selectedTxn || !catValue) return;
    setCatSaving(true);
    const res = await fetch(`/api/treasury/transactions/${selectedTxn.id}/category`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: catValue }),
    });
    const json = await res.json().catch(() => ({}));
    setCatSaving(false);
    if (!res.ok) {
      toast.error(json.message || "Lưu danh mục thất bại");
      return;
    }
    const newCat = (json.category as CategoryOption) ?? null;
    setRows((prev) => prev.map((r) => (r.id === selectedTxn.id ? { ...r, category: newCat } : r)));
    setSelectedTxn((prev) => (prev ? { ...prev, category: newCat } : prev));
    toast.success("Đã cập nhật danh mục");
  }

  const net = totals.in - totals.out;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const csvHref = `/api/treasury/transactions?${filterQs.toString()}&format=csv`;
  const accts = summary?.accounts ?? [];

  return (
    <div className={`sqdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="mark">HG</div>
            <div>
              <b>HUỲNH GIA</b>
              <span>Sổ quỹ công ty</span>
            </div>
          </div>
          <div className="tbtns">
            <button className="iconbtn" onClick={toggleTheme} type="button" aria-label="Đổi nền sáng/tối">
              ◑
            </button>
            <Link href="/" className="iconbtn" aria-label="Về trang chính">
              ‹
            </Link>
          </div>
        </div>

        <div className="eyebrow">Sổ quỹ · toàn công ty</div>
        <h1>Số dư & giao dịch</h1>
        <div className="meta">
          <span>
            <span className="num">{total}</span> giao dịch{hasActiveFilter ? " (lọc)" : ""}
          </span>
          {summary?.lastTxnAt ? (
            <>
              <span className="d">·</span>
              <span>Cập nhật {fmtDateTime(summary.lastTxnAt)}</span>
            </>
          ) : null}
        </div>

        {/* Số dư công ty */}
        {summary?.initialized ? (
          <div className="bal">
            <div className="bal-top">
              <div>
                <div className="bal-l">Số dư công ty</div>
                <div className="bal-v num">{fmt(summary.currentBalance)} đ</div>
              </div>
              <button type="button" className="xfer" onClick={() => setShowTransfer(true)}>
                ⇄ Chuyển quỹ
              </button>
            </div>
            <div className="bal-sub">
              <span>
                Đầu kỳ <span className="num">{fmt(summary.openingBalance)}</span> ({fmtDate(summary.openingDate)})
              </span>
              {summary.pendingExpenseCount > 0 ? (
                <span className="warn">
                  · Chờ chi: {summary.pendingExpenseCount} lệnh — <span className="num">{fmt(summary.pendingExpenseTotal)}</span>
                </span>
              ) : null}
            </div>
            {accts.length > 0 ? (
              <div className="accs">
                {accts.map((a) => (
                  <div className="acc" key={a.id}>
                    <div className="acc-n">
                      <span>{a.name}</span>
                      <span className="acc-k">{ACCOUNT_KIND_LABEL[a.kind]}</span>
                    </div>
                    <div className="acc-v num">{fmt(a.currentBalance)} đ</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="bal">
            <div className="bal-l warn">Sổ quỹ chưa khởi tạo số dư — liên hệ kỹ thuật.</div>
          </div>
        )}

        {/* Tổng thu / chi / chênh lệch (khớp bộ lọc) */}
        <div className="tot">
          <div>
            <div className="st-l">Tổng thu{hasActiveFilter ? " (lọc)" : ""}</div>
            <div className="st-v in num">{fmt(totals.in)}</div>
          </div>
          <div>
            <div className="st-l">Tổng chi{hasActiveFilter ? " (lọc)" : ""}</div>
            <div className="st-v out num">{fmt(totals.out)}</div>
          </div>
          <div>
            <div className="st-l">Chênh lệch</div>
            <div className={`st-v num ${net >= 0 ? "net-pos" : "net-neg"}`}>
              {net >= 0 ? "+" : "−"}
              {fmt(Math.abs(net))}
            </div>
          </div>
        </div>

        {/* Công cụ */}
        <div className="tools">
          <button type="button" className={`tbtn ${showFilters || hasActiveFilter ? "on" : ""}`} onClick={() => setShowFilters((v) => !v)}>
            ⚲ Bộ lọc{hasActiveFilter ? " •" : ""}
          </button>
          {hasActiveFilter ? (
            <button type="button" className="tbtn" onClick={reset}>
              Xoá lọc
            </button>
          ) : null}
          <a className="tbtn csv" href={csvHref}>
            ⤓ CSV
          </a>
        </div>

        {showFilters ? (
          <div className="filters">
            <div className="fld">
              <label>Loại</label>
              <select className="sel" value={direction} onChange={(e) => setDirection(e.target.value)}>
                <option value="">Thu & chi</option>
                <option value="in">Chỉ thu</option>
                <option value="out">Chỉ chi</option>
              </select>
            </div>
            <div className="fld">
              <label>Nguồn</label>
              <select className="sel" value={refType} onChange={(e) => setRefType(e.target.value)}>
                <option value="">Tất cả</option>
                {(Object.keys(REFTYPE_LABEL) as Txn["refType"][]).map((k) => (
                  <option key={k} value={k}>
                    {REFTYPE_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld full">
              <label>Dự án</label>
              <select className="sel" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                <option value="">Tất cả dự án</option>
                <option value="none">Chi chung công ty</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            {accts.length > 0 ? (
              <div className="fld">
                <label>Tài khoản</label>
                <select className="sel" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                  <option value="">Mọi tài khoản</option>
                  {accts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="fld">
              <label>Danh mục</label>
              <select className="sel" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">Tất cả danh mục</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>Từ ngày</label>
              <input className="dt" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="fld">
              <label>Đến ngày</label>
              <input className="dt" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        ) : null}

        {/* Danh sách giao dịch */}
        <div className="list">
          {loading ? (
            <div className="load">Đang tải…</div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <div className="ic">📒</div>
              Không có giao dịch nào theo bộ lọc.
            </div>
          ) : (
            rows.map((r) => {
              const isIn = r.direction === "in";
              return (
                <button type="button" className="row" key={r.id} onClick={() => setSelectedTxn(r)}>
                  <div className="rtop">
                    <span className="chip">{REFTYPE_LABEL[r.refType]}</span>
                    <span className="rdate">{fmtDate(r.occurredAt)}</span>
                    <span className={`ramt ${isIn ? "in" : "out"}`}>
                      {isIn ? "+" : "−"}
                      {fmt(r.amount)}
                    </span>
                  </div>
                  {r.note ? <div className="rnote">{r.note}</div> : null}
                  <div className="rsub">
                    {r.account ? (
                      <span>
                        {r.refType === "transfer" && r.counterAccount
                          ? r.direction === "out"
                            ? `${r.account.name} → ${r.counterAccount.name}`
                            : `${r.counterAccount.name} → ${r.account.name}`
                          : r.account.name}
                      </span>
                    ) : null}
                    <span className="proj">· {r.project ? r.project.code : "Chung công ty"}</span>
                    {r.category ? <span>· {r.category.name}</span> : null}
                    {r.attachments.length > 0 ? <span className="clip">· 📎 {r.attachments.length}</span> : null}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {totalPages > 1 ? (
          <div className="pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ‹ Trước
            </button>
            <span className="pc">
              Trang {page}/{totalPages}
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Sau ›
            </button>
          </div>
        ) : null}
      </div>

      {/* Overlay portal ra body (tránh app-shell transform neo fixed xuống đáy) */}
      {mounted &&
        (selectedTxn || showTransfer) &&
        createPortal(
          <div className={`sqportal ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
            {/* Modal chi tiết */}
            {selectedTxn ? (
              <div className="ovl" onClick={() => setSelectedTxn(null)}>
                <div className="sheet" onClick={(e) => e.stopPropagation()}>
                  <div className="sh-top">
                    <span className="chip">
                      {REFTYPE_LABEL[selectedTxn.refType]} · {selectedTxn.direction === "in" ? "Thu" : "Chi"}
                    </span>
                    <button type="button" className="sh-x" onClick={() => setSelectedTxn(null)} aria-label="Đóng">
                      ✕
                    </button>
                  </div>
                  <div className={`sh-amt ${selectedTxn.direction === "in" ? "in" : "out"}`}>
                    {selectedTxn.direction === "in" ? "+" : "−"}
                    {fmt(selectedTxn.amount)} đ
                  </div>
                  <div className="sh-bal">
                    Số dư sau: <span className="num">{fmt(selectedTxn.balanceAfter)}</span> đ
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div className="kv">
                      <span className="k">Ngày phát sinh</span>
                      <span className="v">{fmtDate(selectedTxn.occurredAt)}</span>
                    </div>
                    <div className="kv">
                      <span className="k">Tạo lúc</span>
                      <span className="v">{fmtDateTime(selectedTxn.createdAt)}</span>
                    </div>
                    <div className="kv">
                      <span className="k">Người tạo</span>
                      <span className="v">{selectedTxn.creator.fullName}</span>
                    </div>
                    {selectedTxn.account ? (
                      <div className="kv">
                        <span className="k">Tài khoản</span>
                        <span className="v">
                          {selectedTxn.refType === "transfer" && selectedTxn.counterAccount
                            ? selectedTxn.direction === "out"
                              ? `${selectedTxn.account.name} → ${selectedTxn.counterAccount.name}`
                              : `${selectedTxn.counterAccount.name} → ${selectedTxn.account.name}`
                            : `${selectedTxn.account.name} (${ACCOUNT_KIND_LABEL[selectedTxn.account.kind]})`}
                        </span>
                      </div>
                    ) : null}
                    <div className="kv">
                      <span className="k">Dự án</span>
                      <span className="v">
                        {selectedTxn.project ? `${selectedTxn.project.code} — ${selectedTxn.project.name}` : "Chung công ty"}
                      </span>
                    </div>
                    <div className="kv">
                      <span className="k">Danh mục</span>
                      {selectedTxn.refType === "expense" ? (
                        <span className="catbox">
                          <select className="sel" value={catValue} onChange={(e) => setCatValue(e.target.value)}>
                            <option value="">— Chọn —</option>
                            {editCatOptions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          {catValue !== (selectedTxn.category?.id ?? "") && catValue ? (
                            <button type="button" className="catsave" onClick={saveCategory} disabled={catSaving}>
                              {catSaving ? "..." : "Lưu"}
                            </button>
                          ) : null}
                        </span>
                      ) : (
                        <span className="v">{selectedTxn.category?.name ?? "—"}</span>
                      )}
                    </div>
                    {selectedTxn.refId ? (
                      <div className="kv">
                        <span className="k">Mã tham chiếu</span>
                        <span className="v mono">{selectedTxn.refId}</span>
                      </div>
                    ) : null}
                  </div>

                  {selectedTxn.note ? (
                    <div className="sh-note">
                      <span className="k">Ghi chú</span>
                      {selectedTxn.note}
                    </div>
                  ) : null}

                  {selectedTxn.attachments.length > 0 ? (
                    <div className="atts">
                      {selectedTxn.attachments.map((att, i) =>
                        att.isImage ? (
                          <button type="button" className="att" key={`${att.url}-${i}`} onClick={() => setLightboxIdx(imgAtts.findIndex((x) => x.url === att.url))} aria-label="Xem ảnh">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={att.url} alt="Chứng từ" loading="lazy" />
                          </button>
                        ) : (
                          <a className="att" key={`${att.url}-${i}`} href={att.url} target="_blank" rel="noreferrer">
                            <span style={{ fontSize: 22 }}>📎</span>
                            Mở tệp
                          </a>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Modal chuyển quỹ */}
            {showTransfer ? (
              <div className="ovl" onClick={() => setShowTransfer(false)}>
                <div className="sheet" onClick={(e) => e.stopPropagation()}>
                  <div className="sh-top">
                    <span className="sh-title">Chuyển quỹ</span>
                    <button type="button" className="sh-x" onClick={() => setShowTransfer(false)} aria-label="Đóng">
                      ✕
                    </button>
                  </div>
                  <div className="frm">
                    <div className="fld">
                      <label>Từ tài khoản</label>
                      <select className="sel" value={trFrom} onChange={(e) => setTrFrom(e.target.value)}>
                        <option value="">— Chọn —</option>
                        {accts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({ACCOUNT_KIND_LABEL[a.kind]}) · {fmt(a.currentBalance)} đ
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="fld">
                      <label>Đến tài khoản</label>
                      <select className="sel" value={trTo} onChange={(e) => setTrTo(e.target.value)}>
                        <option value="">— Chọn —</option>
                        {accts
                          .filter((a) => a.id !== trFrom)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({ACCOUNT_KIND_LABEL[a.kind]})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="fld">
                      <label>Số tiền</label>
                      <input className="in num" type="number" inputMode="numeric" min={0} value={trAmount} onChange={(e) => setTrAmount(e.target.value)} />
                    </div>
                    <div className="fld">
                      <label>Ngày chuyển</label>
                      <input className="in" type="date" value={trDate} onChange={(e) => setTrDate(e.target.value)} />
                    </div>
                    <div className="fld">
                      <label>Ghi chú</label>
                      <textarea rows={2} value={trNote} onChange={(e) => setTrNote(e.target.value)} />
                    </div>
                    <div className="frm-act">
                      <button type="button" className="btn-ghost" onClick={() => setShowTransfer(false)} disabled={trSaving}>
                        Hủy
                      </button>
                      <button type="button" className="btn-go" onClick={submitTransfer} disabled={trSaving}>
                        {trSaving ? "Đang chuyển..." : "Xác nhận"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

          </div>,
          document.body,
        )}

      {/* Lightbox ảnh — vuốt ngang, tự portal ra body */}
      {selectedTxn && lightboxIdx !== null ? (
        <SwipeLightbox imgs={imgAtts.map((a) => a.url)} startIdx={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      ) : null}
    </div>
  );
}
