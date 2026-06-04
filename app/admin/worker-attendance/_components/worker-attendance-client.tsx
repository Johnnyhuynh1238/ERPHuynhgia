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
        draft[r.workerId] = r.dailyRate != null ? String(r.dailyRate) : "";
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Bảng công thợ theo tuần</h1>
        <p className="text-sm text-white/60">
          Chọn dự án + tuần, nhập lương ngày cho từng thợ. Tổng lương = số công × lương ngày. Xuất Excel kèm bảng lương.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <label className="space-y-1 text-sm">
          <span className="block text-white/70">Dự án</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="min-w-[16rem] rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white"
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setRefDate((d) => addDaysYmd(d, -7))}
              disabled={!projectId || loading}
            >
              ← Tuần trước
            </Button>
            <div className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white min-w-[10rem] text-center">
              {weekTitle}
            </div>
            <Button
              variant="outline"
              onClick={() => setRefDate((d) => addDaysYmd(d, 7))}
              disabled={!projectId || loading}
            >
              Tuần sau →
            </Button>
            <Button variant="ghost" onClick={() => setRefDate(todayYmd())} disabled={!projectId || loading}>
              Hôm nay
            </Button>
          </div>
        </div>

        <Button onClick={fetchData} disabled={!projectId || loading}>
          {loading ? "Đang tải..." : "Tải lại"}
        </Button>

        {exportUrl ? (
          <a
            href={exportUrl}
            className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500"
          >
            📥 Xuất Excel bảng lương
          </a>
        ) : null}
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
                    <div className="font-medium">{r.fullName}</div>
                    <div className="text-[11px] text-white/40">
                      {r.role === "tho" ? "Thợ" : "Phụ"} {r.phone ? `· ${r.phone}` : ""}
                    </div>
                  </td>
                  {data.dates.map((d) => {
                    const cell = r.days[d];
                    return (
                      <td key={d} className="px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1 text-[11px]">
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded ${
                              cell?.morning
                                ? "bg-emerald-500/30 text-emerald-200 ring-1 ring-emerald-400/40"
                                : "bg-white/5 text-white/30"
                            }`}
                            title="Sáng"
                          >
                            S
                          </span>
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded ${
                              cell?.afternoon
                                ? "bg-sky-500/30 text-sky-200 ring-1 ring-sky-400/40"
                                : "bg-white/5 text-white/30"
                            }`}
                            title="Chiều"
                          >
                            C
                          </span>
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
                          setRateDraft((m) => ({ ...m, [r.workerId]: e.target.value }))
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
                <td colSpan={7} />
                <td className="px-3 py-2 text-right font-semibold">{data.totals.workDays}</td>
                <td />
                <td className="px-3 py-2 text-right font-semibold text-emerald-300">
                  {formatVnd(data.totals.totalWage)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
