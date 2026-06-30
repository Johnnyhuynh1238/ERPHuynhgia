"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ProjectOption = { id: string; code: string; name: string };
type CategoryOption = { id: string; code: string; name: string };

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

function money(v: number | null | undefined) {
  return `${(v || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} đ`;
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtDateTime(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(
    d.getHours(),
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
const REFTYPE_CHIP: Record<Txn["refType"], string> = {
  opening: "bg-slate-500/15 text-slate-300",
  expense: "bg-orange-500/15 text-orange-300",
  sub_payment: "bg-purple-500/15 text-purple-300",
  material_proposal: "bg-cyan-500/15 text-cyan-300",
  payment_schedule: "bg-emerald-500/15 text-emerald-300",
  receipt: "bg-green-500/15 text-green-300",
  transfer: "bg-indigo-500/15 text-indigo-300",
};

const ACCOUNT_KIND_LABEL: Record<"cash" | "bank", string> = {
  cash: "Tiền mặt",
  bank: "Ngân hàng",
};

export function TreasuryClient({
  projects,
  categories,
}: {
  projects: ProjectOption[];
  categories: CategoryOption[];
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);

  const [direction, setDirection] = useState<string>("");
  const [refType, setRefType] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;
  const [showFilters, setShowFilters] = useState(false);

  const [selectedTxn, setSelectedTxn] = useState<Txn | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

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
      fetch(`/api/treasury/transactions?${filterQs.toString()}&page=${page}&pageSize=${pageSize}`, {
        cache: "no-store",
      }),
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
  }, [filterQs, page]);

  useEffect(() => {
    load();
  }, [load]);

  function reset() {
    setDirection("");
    setRefType("");
    setProjectFilter("");
    setCategoryFilter("");
    setAccountFilter("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  function exportCsv() {
    const qs = new URLSearchParams(filterQs);
    qs.set("format", "csv");
    window.location.href = `/api/treasury/transactions?${qs.toString()}`;
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
      body: JSON.stringify({
        fromAccountId: trFrom,
        toAccountId: trTo,
        amount: amt,
        occurredAt: trDate,
        note: trNote || null,
      }),
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* Số dư card */}
      <div className="rounded-2xl border border-orange-400/30 bg-gradient-to-br from-[#1a1d2a] to-[#13151f] p-5">
        {summary?.initialized ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-[#8b95b7]">Số dư công ty</div>
                <div className="mt-1 text-3xl font-bold text-orange-300">{money(summary.currentBalance)}</div>
              </div>
              <button
                type="button"
                onClick={() => setShowTransfer(true)}
                className="rounded-lg bg-indigo-500/15 px-3 py-1.5 text-sm text-indigo-300 hover:bg-indigo-500/25"
              >
                ⇄ Chuyển quỹ
              </button>
            </div>
            <div className="mt-2 grid gap-2 text-xs text-[#8b95b7] md:grid-cols-3">
              <div>
                Đầu kỳ: <span className="text-[#cfd4e8]">{money(summary.openingBalance)}</span>{" "}
                ({fmtDate(summary.openingDate)})
              </div>
              <div>
                Cập nhật cuối: <span className="text-[#cfd4e8]">{fmtDateTime(summary.lastTxnAt)}</span>
              </div>
              <div>
                Lệnh chi đang chờ:{" "}
                <span className="text-amber-300">
                  {summary.pendingExpenseCount} lệnh — {money(summary.pendingExpenseTotal)}
                </span>
              </div>
            </div>
            {summary.accounts.length > 0 && (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {summary.accounts.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-[#2d3249] bg-[#0b0d16] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-[#f0f2ff]">{a.name}</div>
                      <span className="rounded-full bg-[#1a1d2e] px-2 py-0.5 text-[10px] uppercase text-[#8b95b7]">
                        {ACCOUNT_KIND_LABEL[a.kind]}
                      </span>
                    </div>
                    <div className="mt-1 text-lg font-bold text-emerald-300">{money(a.currentBalance)}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-amber-300">
            Sổ quỹ chưa khởi tạo. Liên hệ kỹ thuật để chạy migration khởi tạo số dư.
          </div>
        )}
      </div>

      {/* Filter toggle bar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            showFilters || hasActiveFilter
              ? "border-[#f97316] bg-[#f97316]/15 text-[#fb923c]"
              : "border-[#2d3249] text-[#8b95b7]"
          }`}
        >
          {showFilters ? "⏶ Ẩn lọc" : `⏷ Lọc${hasActiveFilter ? " (đang áp dụng)" : ""}`}
        </button>
        {hasActiveFilter && (
          <button onClick={reset} className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-xs text-[#8b95b7]">
            Reset
          </button>
        )}
        <button
          onClick={exportCsv}
          className="ml-auto rounded-lg bg-emerald-500/15 text-emerald-300 px-3 py-1.5 text-sm"
        >
          Export CSV
        </button>
      </div>

      {/* Filter (collapsible) */}
      {showFilters && (
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[#2d3249] bg-[#13151f] p-2">
        <select
          value={direction}
          onChange={(e) => {
            setDirection(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
        >
          <option value="">Tất cả</option>
          <option value="in">Thu</option>
          <option value="out">Chi</option>
        </select>
        <select
          value={refType}
          onChange={(e) => {
            setRefType(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
        >
          <option value="">Mọi loại</option>
          <option value="payment_schedule">Thu chủ nhà</option>
          <option value="receipt">Lệnh thu</option>
          <option value="expense">Lệnh chi</option>
          <option value="sub_payment">TT thầu phụ</option>
          <option value="material_proposal">Đề xuất vật tư</option>
          <option value="opening">Khởi tạo</option>
          <option value="transfer">Chuyển quỹ</option>
        </select>
        {summary?.accounts && summary.accounts.length > 0 && (
          <select
            value={accountFilter}
            onChange={(e) => {
              setAccountFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
          >
            <option value="">Mọi tài khoản</option>
            {summary.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({ACCOUNT_KIND_LABEL[a.kind]})
              </option>
            ))}
          </select>
        )}
        <select
          value={projectFilter}
          onChange={(e) => {
            setProjectFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
        >
          <option value="">Tất cả dự án</option>
          <option value="none">Chi chung công ty</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
        >
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex flex-col text-xs text-[#8b95b7]">
          <span>Từ ngày</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-2 py-1 text-sm text-[#f0f2ff]"
          />
        </label>
        <label className="flex flex-col text-xs text-[#8b95b7]">
          <span>Đến ngày</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-2 py-1 text-sm text-[#f0f2ff]"
          />
        </label>
        <button
          onClick={reset}
          className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-sm text-[#8b95b7]"
        >
          Reset
        </button>
      </div>
      )}

      {/* Nhật ký dạng card */}
      <div className="space-y-2">
        {loading && (
          <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-6 text-center text-sm text-[#8892b0]">
            Đang tải…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-6 text-center text-sm text-[#8892b0]">
            Không có giao dịch nào theo bộ lọc.
          </div>
        )}
        {!loading &&
          rows.map((r) => {
            const isIn = r.direction === "in";
            return (
              <div
                key={r.id}
                onClick={() => setSelectedTxn(r)}
                className="cursor-pointer rounded-xl border border-[#2d3249] bg-[#13151f] p-3 shadow-sm transition hover:border-orange-400/40 hover:bg-[#181b28]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${REFTYPE_CHIP[r.refType]}`}>
                      {REFTYPE_LABEL[r.refType]}
                    </span>
                    <span className="text-xs text-[#8b95b7]">{fmtDate(r.occurredAt)}</span>
                  </div>
                  <div
                    className={`text-base font-bold whitespace-nowrap ${
                      isIn ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {isIn ? "+" : "−"} {money(r.amount)}
                  </div>
                </div>

                {(r.note || r.project || r.category || r.account) && (
                  <div className="mt-2 space-y-1 text-sm text-[#cfd4e8]">
                    {r.note && <div className="break-words">{r.note}</div>}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#8b95b7]">
                      {r.account && (
                        <span className="text-indigo-300">
                          {r.refType === "transfer" && r.counterAccount
                            ? r.direction === "out"
                              ? `${r.account.name} → ${r.counterAccount.name}`
                              : `${r.counterAccount.name} → ${r.account.name}`
                            : r.account.name}
                        </span>
                      )}
                      {r.project && (
                        <span>
                          <span className="font-mono">{r.project.code}</span> · {r.project.name}
                        </span>
                      )}
                      {r.category && <span>· {r.category.name}</span>}
                    </div>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#2d3249]/60 pt-2 text-xs text-[#8b95b7]">
                  <span className="flex items-center gap-2">
                    {r.creator.fullName}
                    {r.attachments.length > 0 && (
                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300">
                        📎 {r.attachments.length}
                      </span>
                    )}
                  </span>
                  <span>
                    Số dư sau: <span className="font-semibold text-[#cfd4e8]">{money(r.balanceAfter)}</span>
                  </span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Detail modal */}
      {selectedTxn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedTxn(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#2d3249] bg-[#13151f] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${REFTYPE_CHIP[selectedTxn.refType]}`}
                >
                  {REFTYPE_LABEL[selectedTxn.refType]}
                </span>
                <span className="text-sm text-[#8b95b7]">
                  {selectedTxn.direction === "in" ? "Thu" : "Chi"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTxn(null)}
                className="text-[#8b95b7] hover:text-[#f0f2ff]"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            <div
              className={`text-2xl font-bold ${
                selectedTxn.direction === "in" ? "text-emerald-300" : "text-red-300"
              }`}
            >
              {selectedTxn.direction === "in" ? "+" : "−"} {money(selectedTxn.amount)}
            </div>
            <div className="mt-1 text-xs text-[#8b95b7]">
              Số dư sau giao dịch:{" "}
              <span className="font-semibold text-[#cfd4e8]">{money(selectedTxn.balanceAfter)}</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-[#8b95b7]">Ngày phát sinh</span>
                <span className="text-[#f0f2ff]">{fmtDate(selectedTxn.occurredAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[#8b95b7]">Tạo lúc</span>
                <span className="text-[#f0f2ff]">{fmtDateTime(selectedTxn.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[#8b95b7]">Người tạo</span>
                <span className="text-[#f0f2ff]">{selectedTxn.creator.fullName}</span>
              </div>
              {selectedTxn.account && (
                <div className="flex justify-between gap-3">
                  <span className="text-[#8b95b7]">Tài khoản</span>
                  <span className="text-indigo-300">
                    {selectedTxn.refType === "transfer" && selectedTxn.counterAccount
                      ? selectedTxn.direction === "out"
                        ? `${selectedTxn.account.name} → ${selectedTxn.counterAccount.name}`
                        : `${selectedTxn.counterAccount.name} → ${selectedTxn.account.name}`
                      : `${selectedTxn.account.name} (${ACCOUNT_KIND_LABEL[selectedTxn.account.kind]})`}
                  </span>
                </div>
              )}
              {selectedTxn.project && (
                <div className="flex justify-between gap-3">
                  <span className="text-[#8b95b7]">Dự án</span>
                  <span className="text-[#f0f2ff]">
                    <span className="font-mono">{selectedTxn.project.code}</span> · {selectedTxn.project.name}
                  </span>
                </div>
              )}
              {selectedTxn.category && (
                <div className="flex justify-between gap-3">
                  <span className="text-[#8b95b7]">Danh mục</span>
                  <span className="text-[#f0f2ff]">{selectedTxn.category.name}</span>
                </div>
              )}
              {selectedTxn.refId && (
                <div className="flex justify-between gap-3">
                  <span className="text-[#8b95b7]">Mã tham chiếu</span>
                  <span className="font-mono text-[11px] text-[#8b95b7]">{selectedTxn.refId}</span>
                </div>
              )}
            </div>

            {selectedTxn.note && (
              <div className="mt-4 rounded-lg border border-[#2d3249] bg-[#0b0d16] p-3">
                <div className="mb-1 text-xs uppercase tracking-wide text-[#8b95b7]">Ghi chú</div>
                <div className="whitespace-pre-wrap break-words text-sm text-[#cfd4e8]">
                  {selectedTxn.note}
                </div>
              </div>
            )}

            {selectedTxn.attachments.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-xs uppercase tracking-wide text-[#8b95b7]">
                  Chứng từ ({selectedTxn.attachments.length})
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {selectedTxn.attachments.map((att, i) =>
                    att.isImage ? (
                      <button
                        key={`${att.url}-${i}`}
                        type="button"
                        onClick={() => setLightboxUrl(att.url)}
                        className="aspect-square overflow-hidden rounded-lg border border-[#2d3249] bg-[#0b0d16] transition hover:border-orange-400/60"
                        aria-label="Xem ảnh"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={att.url}
                          alt="Chứng từ"
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <a
                        key={`${att.url}-${i}`}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-[#2d3249] bg-[#0b0d16] text-xs text-indigo-300 hover:border-orange-400/60"
                      >
                        <span className="text-2xl">📎</span>
                        Mở tệp
                      </a>
                    ),
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTxn(null)}
                className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-sm text-[#8b95b7]"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer modal */}
      {showTransfer && summary?.accounts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#2d3249] bg-[#13151f] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold text-[#f0f2ff]">Chuyển quỹ</div>
              <button
                type="button"
                onClick={() => setShowTransfer(false)}
                className="text-[#8b95b7] hover:text-[#f0f2ff]"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#8b95b7]">Từ tài khoản *</label>
                <select
                  value={trFrom}
                  onChange={(e) => setTrFrom(e.target.value)}
                  className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
                >
                  <option value="">— Chọn tài khoản —</option>
                  {summary.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({ACCOUNT_KIND_LABEL[a.kind]}) · {money(a.currentBalance)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#8b95b7]">Đến tài khoản *</label>
                <select
                  value={trTo}
                  onChange={(e) => setTrTo(e.target.value)}
                  className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
                >
                  <option value="">— Chọn tài khoản —</option>
                  {summary.accounts
                    .filter((a) => a.id !== trFrom)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({ACCOUNT_KIND_LABEL[a.kind]})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#8b95b7]">Số tiền *</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={trAmount}
                  onChange={(e) => setTrAmount(e.target.value)}
                  className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#8b95b7]">Ngày chuyển</label>
                <input
                  type="date"
                  value={trDate}
                  onChange={(e) => setTrDate(e.target.value)}
                  className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#8b95b7]">Ghi chú</label>
                <textarea
                  rows={2}
                  value={trNote}
                  onChange={(e) => setTrNote(e.target.value)}
                  className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTransfer(false)}
                  disabled={trSaving}
                  className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-sm text-[#8b95b7]"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={submitTransfer}
                  disabled={trSaving}
                  className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {trSaving ? "Đang chuyển..." : "Xác nhận"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox ảnh */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxUrl(null);
            }}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-2xl text-white hover:bg-black/80"
            aria-label="Đóng"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Chứng từ"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] max-w-[96vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Phân trang */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-sm text-[#8b95b7]">
          <div>
            Trang {page}/{totalPages} • Tổng {total.toLocaleString("vi-VN")} giao dịch
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[#2d3249] px-3 py-1 disabled:opacity-40"
            >
              ← Trước
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-[#2d3249] px-3 py-1 disabled:opacity-40"
            >
              Sau →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
