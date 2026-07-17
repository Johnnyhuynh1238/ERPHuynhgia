"use client";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import "./thu-chi.css";

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

type CategoryOption = { id: string; code: string; name: string };
type TxnAccount = { id: string; code: string; name: string; kind: "cash" | "bank" };
type ProjectRef = { id: string; code: string; name: string };

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
  project: ProjectRef | null;
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

export function ProjectCashLedgerClient({
  projectId,
  projectCode,
  projectName,
  projectAddress,
  categories,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectAddress?: string | null;
  categories: CategoryOption[];
}) {
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

  const [rows, setRows] = useState<Txn[]>([]);
  const [totals, setTotals] = useState<{ in: number; out: number }>({ in: 0, out: 0 });
  const [loading, setLoading] = useState(true);

  const [direction, setDirection] = useState<string>("");
  const [refType, setRefType] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;
  const [showFilters, setShowFilters] = useState(false);

  const [selectedTxn, setSelectedTxn] = useState<Txn | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [catValue, setCatValue] = useState<string>("");
  const [catSaving, setCatSaving] = useState(false);

  useEffect(() => setCatValue(selectedTxn?.category?.id ?? ""), [selectedTxn]);

  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLightboxUrl(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  const hasActiveFilter = !!(direction || refType || categoryFilter || from || to);

  const filterQs = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("projectId", projectId);
    if (direction) qs.set("direction", direction);
    if (refType) qs.set("refType", refType);
    if (categoryFilter) qs.set("categoryId", categoryFilter);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    return qs;
  }, [projectId, direction, refType, categoryFilter, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/treasury/transactions?${filterQs.toString()}&page=${page}&pageSize=${pageSize}`,
      { cache: "no-store" },
    );
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast.error(json.message || "Không tải được thu chi dự án");
      return;
    }
    setRows(json.rows || []);
    setTotal(json.total || 0);
    setTotals(json.totals || { in: 0, out: 0 });
  }, [filterQs, page]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => setPage(1), [direction, refType, categoryFilter, from, to]);

  function reset() {
    setDirection("");
    setRefType("");
    setCategoryFilter("");
    setFrom("");
    setTo("");
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

  return (
    <div className={`tcdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="mark">HG</div>
            <div>
              <b>HUỲNH GIA</b>
              <span>Thu chi dự án</span>
            </div>
          </div>
          <div className="tbtns">
            <button className="iconbtn" onClick={toggleTheme} type="button" aria-label="Đổi nền sáng/tối">
              ◑
            </button>
            <Link href={`/projects/${projectId}`} className="iconbtn" aria-label="Về dự án">
              ‹
            </Link>
          </div>
        </div>

        <div className="eyebrow">Thu chi · sổ quỹ dự án</div>
        <h1>{projectName}</h1>
        <div className="meta">
          <span>{projectCode}</span>
          {projectAddress ? (
            <>
              <span className="d">·</span>
              <span>{projectAddress}</span>
            </>
          ) : null}
          <span className="d">·</span>
          <span>
            <span className="num">{total}</span> giao dịch{hasActiveFilter ? " (lọc)" : ""}
          </span>
        </div>

        {/* Tổng thu / chi / chênh lệch */}
        <div className="tot">
          <div>
            <div className="st-l">Tổng thu</div>
            <div className="st-v in num">{fmt(totals.in)}</div>
          </div>
          <div>
            <div className="st-l">Tổng chi</div>
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
              <div className="ic">💸</div>
              Chưa có giao dịch thu chi nào cho dự án này.
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
                <span className="k">Danh mục</span>
                {selectedTxn.refType === "expense" ? (
                  <span className="catbox">
                    <select className="sel" value={catValue} onChange={(e) => setCatValue(e.target.value)}>
                      <option value="">— Chọn —</option>
                      {categories.map((c) => (
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
                    <button type="button" className="att" key={`${att.url}-${i}`} onClick={() => setLightboxUrl(att.url)} aria-label="Xem ảnh">
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

      {/* Lightbox */}
      {lightboxUrl ? (
        <div className="lb" onClick={() => setLightboxUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Chứng từ" />
        </div>
      ) : null}
    </div>
  );
}
