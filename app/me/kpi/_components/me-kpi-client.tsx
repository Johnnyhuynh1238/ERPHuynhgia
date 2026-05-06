"use client";

import { useEffect, useMemo, useState } from "react";

type KpiCurrentResponse = {
  month: string;
  isRealtime: boolean;
  hasData: boolean;
  message?: string;
  totalScore: number;
  estimatedBonusRatio?: number;
  scores: {
    schedule: number;
    qc: number;
    report: number;
    customer: number;
    contribution: number;
  };
  settings?: {
    weights: Record<keyof KpiCurrentResponse["scores"], number>;
  };
  salary: {
    salaryMax: number;
    baseSalary: number;
    bonusMax: number;
    bonusAmount: number;
    totalSalary: number;
  } | null;
};

type KpiRow = {
  key: keyof KpiCurrentResponse["scores"];
  icon: string;
  label: string;
  note: string;
  color: "orange" | "green";
};

const KPI_ROWS: KpiRow[] = [
  {
    key: "schedule",
    icon: "📊",
    label: "Tiến độ",
    note: "Tỷ lệ công việc đúng hạn",
    color: "orange",
  },
  {
    key: "qc",
    icon: "✅",
    label: "Chất lượng QC",
    note: "Tỷ lệ QC đạt ngay lần đầu",
    color: "green",
  },
  {
    key: "report",
    icon: "📝",
    label: "Báo cáo",
    note: "Độ đầy đủ báo cáo ngày",
    color: "orange",
  },
  {
    key: "customer",
    icon: "😊",
    label: "Chủ nhà hài lòng",
    note: "50% rating task + 50% rating kỹ sư, fallback 70 khi thiếu",
    color: "green",
  },
  {
    key: "contribution",
    icon: "🎯",
    label: "Đóng góp",
    note: "TPTC chấm cuối tháng",
    color: "orange",
  },
];

function currency(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function thisMonthValue() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function tierText(bonusPercent: number | null) {
  if (bonusPercent === null) return "Chưa xác định bậc thưởng";
  if (bonusPercent >= 100) return "Xuất sắc → 100% thưởng";
  if (bonusPercent >= 75) return "Tốt → 75% thưởng";
  if (bonusPercent >= 50) return "Đạt → 50% thưởng";
  if (bonusPercent >= 25) return "Cần cải thiện → 25% thưởng";
  return "Dưới chuẩn → 0% thưởng";
}

export function MeKpiClient() {
  const [month, setMonth] = useState(thisMonthValue());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<KpiCurrentResponse | null>(null);

  useEffect(() => {
    let ignore = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/engineers/me/kpi/current?month=${month}`, { cache: "no-store" });
        const json = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(typeof json?.message === "string" ? json.message : "Không tải được dữ liệu KPI");
        }

        if (!ignore) {
          setData(json as KpiCurrentResponse);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Không tải được dữ liệu KPI");
          setData(null);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      ignore = true;
    };
  }, [month]);

  const bonusPercent = useMemo(() => {
    if (!data?.estimatedBonusRatio && data?.estimatedBonusRatio !== 0) return null;
    return Math.round(data.estimatedBonusRatio * 100);
  }, [data?.estimatedBonusRatio]);

  const salaryGap = useMemo(() => {
    if (!data?.salary) return null;
    return data.salary.totalSalary - data.salary.salaryMax;
  }, [data?.salary]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[#d9def3]">KPI / Lương kỹ sư</div>
          <a
            href="/me/kpi/guide"
            aria-label="Xem hướng dẫn tính KPI"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#f97316]/50 bg-[#f97316]/10 text-sm font-extrabold text-[#f97316] transition hover:bg-[#f97316] hover:text-white"
          >
            ?
          </a>
        </div>
        <label className="text-xs text-[#98a0c2]">Tháng</label>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[#3a446d] bg-[#0f1424] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#f97316]"
        />
      </div>

      {loading ? <div className="text-sm text-[#98a0c2]">Đang tải dữ liệu...</div> : null}
      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

      {data?.salary ? (
        <>
          <div className="rounded-[18px] bg-gradient-to-br from-[#f97316] to-[#ea580c] p-5 text-center text-white shadow-[0_8px_24px_rgba(249,115,22,0.3)]">
            <div className="text-[11px] font-semibold uppercase tracking-[1.5px] text-white/85">Lương dự kiến</div>
            <div className="mt-2 text-4xl font-extrabold leading-none tracking-tight">{currency(data.salary.totalSalary)}</div>

            {!data.hasData ? (
              <div className="mt-2 text-sm text-white/90">Mức tối đa khi KPI 100%</div>
            ) : salaryGap !== null && salaryGap < 0 ? (
              <div className="mt-2 text-xs text-white">
                <span className="inline-block rounded-md bg-black/25 px-2.5 py-1">↓ {currency(salaryGap)} so với max {currency(data.salary.salaryMax)}</span>
              </div>
            ) : (
              <div className="mt-2 text-sm text-white/90">Đang đạt mức thưởng tối đa</div>
            )}

            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {data.hasData ? `KPI ${data.totalScore}/100 · Cập nhật real-time` : "Đầu tháng – chưa có dữ liệu"}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-3">
              <div className="text-[10px] font-bold uppercase tracking-[1px] text-[#98a0c2]">Lương cứng</div>
              <div className="mt-1 text-lg font-extrabold text-[#f0f2ff]">{currency(data.salary.baseSalary)}</div>
              <div className="mt-0.5 text-[10px] text-[#22c55e]">✓ Đảm bảo 50%</div>
            </div>
            <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-3">
              <div className="text-[10px] font-bold uppercase tracking-[1px] text-[#98a0c2]">{data.hasData ? "Thưởng hiện tại" : "Thưởng KPI max"}</div>
              <div className="mt-1 text-lg font-extrabold text-[#f0f2ff]">{currency(data.hasData ? data.salary.bonusAmount : data.salary.bonusMax)}</div>
              <div className="mt-0.5 text-[10px] text-[#f97316]">{data.hasData ? `${bonusPercent ?? 0}% × ${currency(data.salary.bonusMax)}` : "50% theo KPI"}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#98a0c2]">Điểm KPI hiện tại</div>
            <div className="py-3 text-center">
              {!data.hasData ? (
                <div className="text-5xl font-extrabold leading-none text-[#f97316]">--<span className="ml-1 text-xl font-semibold text-[#4a5568]">/100</span></div>
              ) : (
                <div className="text-5xl font-extrabold leading-none text-[#f97316]">{data.totalScore}<span className="ml-1 text-xl font-semibold text-[#4a5568]">/100</span></div>
              )}
              <div className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${
                data.hasData ? "bg-emerald-500/15 text-emerald-400" : "bg-blue-500/15 text-blue-300"
              }`}>
                {data.hasData ? tierText(bonusPercent) : "Đầu tháng – chưa có dữ liệu"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[1.5px] text-[#98a0c2]">Chi tiết 5 KPI</div>
            <div className="space-y-1">
              {KPI_ROWS.map((row) => {
                const score = data.scores[row.key];
                const hasScore = typeof score === "number";
                const scoreValue = hasScore ? Math.max(0, Math.min(100, Number(score))) : 0;

                return (
                  <div key={row.key} className="border-b border-[#252840] py-2.5 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#13151f] text-base">{row.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm font-bold text-[#f0f2ff]">{row.label}</div>
                          <span className="rounded bg-[#f97316]/12 px-1.5 py-0.5 text-[9px] font-bold text-[#f97316]">{data.settings?.weights?.[row.key] ?? 0}%</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#4a5568]">{row.note}</div>
                        {hasScore ? (
                          <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-[#13151f]">
                            <div
                              className={`h-full rounded ${row.color === "green" ? "bg-[#22c55e]" : "bg-[#f97316]"}`}
                              style={{ width: `${scoreValue}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                      <div className="text-right">
                        {hasScore ? <div className="text-lg font-extrabold text-[#f0f2ff]">{score}</div> : <div className="text-xs text-[#4a5568]">⏳</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[1.5px] text-[#98a0c2]">Công thức tính lương</div>
            <div className="rounded-xl border border-dashed border-[#252840] bg-[#13151f] p-3 text-xs leading-6">
              <div className="flex items-center justify-between">
                <span className="text-[#98a0c2]">Lương max:</span>
                <b className="text-[#f97316]">{currency(data.salary.salaryMax)}</b>
              </div>
              <div className="my-1 border-t border-dashed border-[#252840]" />
              <div className="flex items-center justify-between">
                <span className="text-[#98a0c2]">Cứng (50%):</span>
                <b className="text-[#f97316]">{currency(data.salary.baseSalary)}</b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#98a0c2]">Thưởng max (50%):</span>
                <b className="text-[#f97316]">{currency(data.salary.bonusMax)}</b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#98a0c2]">Bậc thưởng hiện tại:</span>
                <b className="text-[#f97316]">{bonusPercent ?? 0}%</b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#98a0c2]">Thưởng KPI:</span>
                <b className="text-[#f97316]">{currency(data.salary.bonusAmount)}</b>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-[#f97316] px-3 py-2 text-white">
                <span className="text-sm font-semibold">Tổng tháng này:</span>
                <b className="text-base font-extrabold">{currency(data.salary.totalSalary)}</b>
              </div>
            </div>
          </div>
        </>
      ) : data?.message ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">{data.message}</div>
      ) : null}
    </div>
  );
}
