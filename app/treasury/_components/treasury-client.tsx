"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ProjectOption = { id: string; code: string; name: string };
type CategoryOption = { id: string; code: string; name: string };

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
};

type Txn = {
  id: string;
  direction: "in" | "out";
  amount: number;
  occurredAt: string;
  balanceAfter: number;
  refType: "opening" | "expense" | "sub_payment" | "material_proposal" | "payment_schedule";
  refId: string | null;
  note: string | null;
  createdAt: string;
  project: ProjectOption | null;
  category: CategoryOption | null;
  creator: { id: string; fullName: string };
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
};
const REFTYPE_CHIP: Record<Txn["refType"], string> = {
  opening: "bg-slate-500/15 text-slate-300",
  expense: "bg-orange-500/15 text-orange-300",
  sub_payment: "bg-purple-500/15 text-purple-300",
  material_proposal: "bg-cyan-500/15 text-cyan-300",
  payment_schedule: "bg-emerald-500/15 text-emerald-300",
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
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilter = !!(direction || refType || projectFilter || categoryFilter || from || to);

  const filterQs = useMemo(() => {
    const qs = new URLSearchParams();
    if (direction) qs.set("direction", direction);
    if (refType) qs.set("refType", refType);
    if (projectFilter) qs.set("projectId", projectFilter);
    if (categoryFilter) qs.set("categoryId", categoryFilter);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    return qs;
  }, [direction, refType, projectFilter, categoryFilter, from, to]);

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
    setFrom("");
    setTo("");
    setPage(1);
  }

  function exportCsv() {
    const qs = new URLSearchParams(filterQs);
    qs.set("format", "csv");
    window.location.href = `/api/treasury/transactions?${qs.toString()}`;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* Số dư card */}
      <div className="rounded-2xl border border-orange-400/30 bg-gradient-to-br from-[#1a1d2a] to-[#13151f] p-5">
        {summary?.initialized ? (
          <>
            <div className="text-xs uppercase tracking-wide text-[#8b95b7]">Số dư công ty</div>
            <div className="mt-1 text-3xl font-bold text-orange-300">{money(summary.currentBalance)}</div>
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
          <option value="expense">Lệnh chi</option>
          <option value="sub_payment">TT thầu phụ</option>
          <option value="material_proposal">Đề xuất vật tư</option>
          <option value="opening">Khởi tạo</option>
        </select>
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

      {/* Bảng nhật ký */}
      <div className="rounded-xl border border-[#2d3249] bg-[#13151f] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#0b0d16]/60 text-[#8892b0]">
            <tr>
              <th className="px-3 py-2 text-left whitespace-nowrap">Ngày</th>
              <th className="px-3 py-2 text-left">Loại</th>
              <th className="px-3 py-2 text-left">Dự án</th>
              <th className="px-3 py-2 text-left">Danh mục</th>
              <th className="px-3 py-2 text-left">Mô tả</th>
              <th className="px-3 py-2 text-right">Thu</th>
              <th className="px-3 py-2 text-right">Chi</th>
              <th className="px-3 py-2 text-right">Số dư sau</th>
              <th className="px-3 py-2 text-left">Người ghi</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-[#8892b0]">
                  Đang tải…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-[#8892b0]">
                  Không có giao dịch nào theo bộ lọc.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#2d3249]">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.occurredAt)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${REFTYPE_CHIP[r.refType]}`}>
                    {REFTYPE_LABEL[r.refType]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {r.project ? (
                    <span>
                      <span className="font-mono text-xs text-[#8b95b7]">{r.project.code}</span>{" "}
                      {r.project.name}
                    </span>
                  ) : (
                    <span className="text-[#8b95b7]">—</span>
                  )}
                </td>
                <td className="px-3 py-2">{r.category?.name || "—"}</td>
                <td className="px-3 py-2 max-w-[420px]">
                  <div className="truncate" title={r.note ?? ""}>
                    {r.note || "—"}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap text-emerald-300">
                  {r.direction === "in" ? money(r.amount) : ""}
                </td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap text-red-300">
                  {r.direction === "out" ? money(r.amount) : ""}
                </td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                  {money(r.balanceAfter)}
                </td>
                <td className="px-3 py-2 text-[#8b95b7]">{r.creator.fullName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
