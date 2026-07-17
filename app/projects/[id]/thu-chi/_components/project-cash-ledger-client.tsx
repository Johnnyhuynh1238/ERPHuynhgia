"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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

export function ProjectCashLedgerClient({
  projectId,
  categories,
}: {
  projectId: string;
  categories: CategoryOption[];
}) {
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

  useEffect(() => {
    setCatValue(selectedTxn?.category?.id ?? "");
  }, [selectedTxn]);

  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
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

  // Reset về trang 1 khi đổi bộ lọc
  useEffect(() => {
    setPage(1);
  }, [direction, refType, categoryFilter, from, to]);

  function reset() {
    setDirection("");
    setRefType("");
    setCategoryFilter("");
    setFrom("");
    setTo("");
  }

  async function saveCategory() {
    if (!selectedTxn) return;
    if (!catValue) {
      toast.error("Chọn danh mục");
      return;
    }
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
    <div className="space-y-4">
      {/* Header tổng thu/chi của dự án (khớp bộ lọc) */}
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-orange-300">💸 Thu chi dự án</h2>
          <a
            href={csvHref}
            className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/25"
          >
            ⤓ Tải CSV
          </a>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-500/25 bg-[#0b0d16] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#8b95b7]">Tổng thu</div>
            <div className="mt-1 text-xl font-bold text-emerald-300">{money(totals.in)}</div>
          </div>
          <div className="rounded-xl border border-red-500/25 bg-[#0b0d16] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#8b95b7]">Tổng chi</div>
            <div className="mt-1 text-xl font-bold text-red-300">{money(totals.out)}</div>
          </div>
          <div className="rounded-xl border border-[#2d3249] bg-[#0b0d16] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#8b95b7]">Chênh lệch (thu − chi)</div>
            <div className={`mt-1 text-xl font-bold ${net >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {net >= 0 ? "+" : "−"} {money(Math.abs(net))}
            </div>
          </div>
        </div>
        <div className="mt-2 text-xs text-[#8b95b7]">{total} giao dịch{hasActiveFilter ? " (đang lọc)" : ""}</div>
      </div>

      {/* Filter toggle bar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-1.5 text-sm text-[#cfd4e8] hover:border-orange-400/40"
        >
          {showFilters ? "Ẩn bộ lọc" : "Bộ lọc"}{hasActiveFilter ? " •" : ""}
        </button>
        {hasActiveFilter && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-sm text-[#8b95b7] hover:text-[#f0f2ff]"
          >
            Reset
          </button>
        )}
      </div>

      {showFilters && (
        <div className="grid gap-3 rounded-xl border border-[#2d3249] bg-[#13151f] p-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-[#8b95b7]">Loại</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            >
              <option value="">Thu & chi</option>
              <option value="in">Chỉ thu</option>
              <option value="out">Chỉ chi</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#8b95b7]">Nguồn</label>
            <select
              value={refType}
              onChange={(e) => setRefType(e.target.value)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            >
              <option value="">Tất cả nguồn</option>
              {(Object.keys(REFTYPE_LABEL) as Txn["refType"][]).map((k) => (
                <option key={k} value={k}>
                  {REFTYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#8b95b7]">Danh mục</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            >
              <option value="">Tất cả danh mục</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#8b95b7]">Từ ngày</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#8b95b7]">Đến ngày</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </div>
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
            Chưa có giao dịch thu chi nào cho dự án này.
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
                  <div className={`text-base font-bold whitespace-nowrap ${isIn ? "text-emerald-300" : "text-red-300"}`}>
                    {isIn ? "+" : "−"} {money(r.amount)}
                  </div>
                </div>

                {(r.note || r.category || r.account) && (
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-sm text-[#cfd4e8] disabled:opacity-40"
          >
            ‹ Trước
          </button>
          <span className="text-sm text-[#8b95b7]">
            Trang {page}/{totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-sm text-[#cfd4e8] disabled:opacity-40"
          >
            Sau ›
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selectedTxn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedTxn(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#2d3249] bg-[#13151f] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${REFTYPE_CHIP[selectedTxn.refType]}`}>
                  {REFTYPE_LABEL[selectedTxn.refType]}
                </span>
                <span className="text-sm text-[#8b95b7]">{selectedTxn.direction === "in" ? "Thu" : "Chi"}</span>
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

            <div className={`text-2xl font-bold ${selectedTxn.direction === "in" ? "text-emerald-300" : "text-red-300"}`}>
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
              {selectedTxn.refType === "expense" ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#8b95b7]">Danh mục</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={catValue}
                      onChange={(e) => setCatValue(e.target.value)}
                      className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-2 py-1 text-sm text-[#f0f2ff]"
                    >
                      <option value="">— Chọn danh mục —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {catValue !== (selectedTxn.category?.id ?? "") && (
                      <button
                        type="button"
                        onClick={saveCategory}
                        disabled={catSaving}
                        className="rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {catSaving ? "..." : "Lưu"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                selectedTxn.category && (
                  <div className="flex justify-between gap-3">
                    <span className="text-[#8b95b7]">Danh mục</span>
                    <span className="text-[#f0f2ff]">{selectedTxn.category.name}</span>
                  </div>
                )
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
                <div className="whitespace-pre-wrap break-words text-sm text-[#cfd4e8]">{selectedTxn.note}</div>
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
                        <img src={att.url} alt="Chứng từ" loading="lazy" className="h-full w-full object-cover" />
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

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Chứng từ" className="max-h-[90vh] max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
