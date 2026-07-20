"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type ProjectOption = { id: string; name: string; status: string };

type DayCell = { morning: boolean; afternoon: boolean };

type Row = {
  workerId: string;
  fullName: string;
  role: "tho" | "phu";
  phone: string | null;
  hasIdCardPhoto: boolean;
  dailyRate: number | null;
  days: Record<string, DayCell>;
  sessionCount: number;
  workDays: number;
  totalWage: number | null;
};

type ApiResponse = {
  project: { id: string; name: string };
  projectId: string;
  weekStart: string;
  weekEnd: string;
  dates: string[];
  rows: Row[];
  totals: { workDays: number; totalWage: number };
};

const DOW_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function formatDM(ymd: string) {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

function formatVnd(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("vi-VN").format(n);
}

function parseVndInput(s: string) {
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function formatVndInput(n: number | null) {
  if (n == null) return "";
  return new Intl.NumberFormat("vi-VN").format(n);
}

function SessionPill({ on, label, tone }: { on: boolean; label: string; tone: "morning" | "afternoon" }) {
  const onCls =
    tone === "morning"
      ? "bg-emerald-500/30 text-emerald-200 ring-1 ring-emerald-400/40"
      : "bg-sky-500/30 text-sky-200 ring-1 ring-sky-400/40";
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] ${on ? onCls : "bg-white/5 text-white/30"}`}
      title={tone === "morning" ? "Sáng" : "Chiều"}
    >
      {label}
    </span>
  );
}

export function WorkerAttendanceAdminClient({
  projects,
  canEditWage,
}: {
  projects: ProjectOption[];
  canEditWage: boolean;
}) {
  const [projectId, setProjectId] = useState<string>("");
  const [refDate, setRefDate] = useState<string>(todayYmd());
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingRateId, setSavingRateId] = useState<string | null>(null);
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});
  const [detailWorker, setDetailWorker] = useState<Row | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId, date: refDate });
      const res = await fetch(`/api/admin/worker-attendance?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Không tải được dữ liệu");
      setData(json);
      const draft: Record<string, string> = {};
      for (const r of json.rows as Row[]) {
        draft[r.workerId] = formatVndInput(r.dailyRate);
      }
      setRateDraft(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, refDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveRate = useCallback(
    async (workerId: string) => {
      const raw = rateDraft[workerId] ?? "";
      const value = parseVndInput(raw);
      setSavingRateId(workerId);
      try {
        const res = await fetch(`/api/admin/workers/${workerId}/wage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dailyRate: value }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Không lưu được");
        setData((d) => {
          if (!d) return d;
          const newRows = d.rows.map((r) => {
            if (r.workerId !== workerId) return r;
            const newTotal = value != null ? Math.round(r.workDays * value) : null;
            return { ...r, dailyRate: value, totalWage: newTotal };
          });
          const newTotalWage = newRows.reduce((s, r) => s + (r.totalWage ?? 0), 0);
          return { ...d, rows: newRows, totals: { ...d.totals, totalWage: newTotalWage } };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi không xác định");
      } finally {
        setSavingRateId(null);
      }
    },
    [rateDraft],
  );

  const exportUrl = useMemo(() => {
    if (!projectId) return null;
    const params = new URLSearchParams({ projectId, date: refDate });
    return `/api/admin/worker-attendance/export?${params.toString()}`;
  }, [projectId, refDate]);

  const weekTitle = data ? `${formatDM(data.weekStart)} – ${formatDM(data.weekEnd)}` : "—";

  const detailCccdUrl =
    detailWorker && projectId && detailWorker.hasIdCardPhoto
      ? `/api/cham-cong-tho/${projectId}/workers/${detailWorker.workerId}/cccd`
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl md:text-2xl font-semibold text-white">Bảng công thợ theo tuần</h1>
        <p className="text-xs md:text-sm text-white/60">
          Chọn dự án + tuần. Nhập lương ngày cho từng thợ. Tổng = số công × lương ngày. Bấm tên thợ để xem chi tiết.
        </p>
      </header>

      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
        <label className="block space-y-1 text-sm">
          <span className="block text-white/70">Dự án</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white md:min-w-[16rem] md:w-auto"
          >
            <option value="">— Chọn dự án —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.status === "in_progress" ? "" : `(${p.status})`}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1 text-sm">
          <span className="block text-white/70">Tuần</span>
          <div className="grid grid-cols-3 gap-2 md:flex md:items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefDate((d) => addDaysYmd(d, -7))}
              disabled={!projectId || loading}
            >
              ← Trước
            </Button>
            <div className="rounded-md border border-white/10 bg-slate-900 px-2 py-2 text-center text-sm text-white md:min-w-[10rem] md:px-3">
              {weekTitle}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefDate((d) => addDaysYmd(d, 7))}
              disabled={!projectId || loading}
            >
              Sau →
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="col-span-3 md:col-auto"
              onClick={() => setRefDate(todayYmd())}
              disabled={!projectId || loading}
            >
              Hôm nay
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={fetchData} disabled={!projectId || loading}>
            {loading ? "Đang tải..." : "Tải lại"}
          </Button>
          {exportUrl ? (
            <a
              href={exportUrl}
              className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500"
            >
              📥 Xuất Excel
            </a>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!projectId ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/5 px-6 py-12 text-center text-white/60">
          Chọn dự án để xem bảng công thợ.
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/5 px-6 py-12 text-center text-white/60">
          {loading ? "Đang tải..." : "Dự án chưa có thợ nào."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
          <table className="min-w-full text-sm text-white">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/60">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-900/95 px-3 py-2 text-left">Thợ</th>
                {data.dates.map((d, i) => (
                  <th key={d} className="px-2 py-2 text-center min-w-[3.5rem]">
                    <div>{DOW_LABELS[i]}</div>
                    <div className="text-[10px] font-normal text-white/40">{formatDM(d)}</div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Công</th>
                <th className="px-3 py-2 text-right">Lương ngày (₫)</th>
                <th className="px-3 py-2 text-right">Tổng tuần (₫)</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.workerId} className="border-t border-white/5">
                  <td className="sticky left-0 z-10 bg-slate-900/95 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setDetailWorker(r)}
                      className="text-left font-medium text-sky-200 hover:text-sky-100 hover:underline"
                    >
                      {r.fullName}
                    </button>
                  </td>
                  {data.dates.map((d) => {
                    const cell = r.days[d];
                    return (
                      <td key={d} className="px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <SessionPill on={!!cell?.morning} label="S" tone="morning" />
                          <SessionPill on={!!cell?.afternoon} label="C" tone="afternoon" />
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold">{r.workDays}</td>
                  <td className="px-3 py-2 text-right">
                    {canEditWage ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={rateDraft[r.workerId] ?? ""}
                        onChange={(e) =>
                          setRateDraft((m) => ({
                            ...m,
                            [r.workerId]: formatVndInput(parseVndInput(e.target.value)),
                          }))
                        }
                        onBlur={() => {
                          const draft = rateDraft[r.workerId] ?? "";
                          const draftVal = parseVndInput(draft);
                          if (draftVal !== r.dailyRate) saveRate(r.workerId);
                        }}
                        placeholder="—"
                        disabled={savingRateId === r.workerId}
                        className="w-32 rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-right text-white disabled:opacity-50"
                      />
                    ) : (
                      <span>{formatVnd(r.dailyRate)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-200">
                    {r.totalWage != null ? formatVnd(r.totalWage) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-white/5 text-sm">
              <tr>
                <td className="sticky left-0 z-10 bg-slate-900/95 px-3 py-2 font-semibold">
                  Tổng {data.rows.length} thợ
                </td>
                <td colSpan={data.dates.length} />
                <td className="px-3 py-2 text-right font-semibold">{data.totals.workDays}</td>
                <td className="px-3 py-2 text-right font-semibold text-amber-200">
                  {formatVnd(data.rows.reduce((s, r) => s + (r.dailyRate ?? 0), 0))}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-emerald-300">
                  {formatVnd(data.totals.totalWage)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {data && data.rows.length > 0 ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm text-amber-100/80">
              Lương 1 ngày công trường (nếu toàn bộ {data.rows.length} thợ đi làm)
            </div>
            <div className="text-2xl font-semibold text-amber-200">
              {formatVnd(data.rows.reduce((s, r) => s + (r.dailyRate ?? 0), 0))} ₫
            </div>
          </div>
        </div>
      ) : null}

      {detailWorker ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setDetailWorker(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-white/10 bg-slate-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-semibold text-white">{detailWorker.fullName}</div>
                <div className="text-xs text-white/50">
                  {detailWorker.role === "tho" ? "Thợ chính" : "Thợ phụ"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailWorker(null)}
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-sm text-white/80 hover:bg-white/10"
              >
                Đóng ✕
              </button>
            </div>

            <div className="space-y-2 text-sm text-white">
              <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white/60">Số điện thoại</span>
                {detailWorker.phone ? (
                  <a href={`tel:${detailWorker.phone}`} className="font-medium text-sky-300 hover:underline">
                    {detailWorker.phone}
                  </a>
                ) : (
                  <span className="text-white/40">—</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white/60">Số công tuần này</span>
                <span className="font-semibold">{detailWorker.workDays}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white/60">Lương ngày</span>
                <span className="font-semibold">{formatVnd(detailWorker.dailyRate)} ₫</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white/60">Tổng lương tuần</span>
                <span className="font-semibold text-emerald-300">
                  {detailWorker.totalWage != null ? `${formatVnd(detailWorker.totalWage)} ₫` : "—"}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-white/50">CCCD</div>
              {detailCccdUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={detailCccdUrl}
                  alt={`CCCD ${detailWorker.fullName}`}
                  className="max-h-[50vh] w-full rounded-md border border-white/10 object-contain"
                />
              ) : (
                <div className="rounded-md border border-dashed border-white/15 bg-white/5 px-4 py-6 text-center text-sm text-white/40">
                  Chưa có ảnh CCCD
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
