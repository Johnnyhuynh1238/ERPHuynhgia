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
    contribution: number | null;
  };
  salary: {
    salaryMax: number;
    baseSalary: number;
    bonusMax: number;
    bonusAmount: number;
    totalSalary: number;
  } | null;
};

function currency(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function thisMonthValue() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="mb-2 text-sm font-semibold text-[#d9def3]">KPI / Lương kỹ sư</div>
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

      {data ? (
        <>
          <div className="rounded-2xl border border-[#2f3555] bg-gradient-to-r from-[#202844] to-[#151b2d] p-4">
            <div className="text-xs text-[#aeb6da]">💰 LƯƠNG DỰ KIẾN THÁNG {data.month}</div>
            {data.salary ? (
              <>
                <div className="mt-2 text-3xl font-bold text-[#f7c873]">{currency(data.salary.totalSalary)}</div>
                <div className="mt-1 text-xs text-[#aeb6da]">⚡ Cập nhật real-time theo KPI {data.totalScore}/100</div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-[#d9def3]">
                  <div>Lương max: <b>{currency(data.salary.salaryMax)}</b></div>
                  <div>Lương cứng đảm bảo: <b>{currency(data.salary.baseSalary)}</b></div>
                  <div>Thưởng KPI tối đa: <b>{currency(data.salary.bonusMax)}</b></div>
                  <div>Thưởng hiện tại: <b>{currency(data.salary.bonusAmount)}</b>{bonusPercent !== null ? ` (${bonusPercent}%)` : ""}</div>
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-[#ffd9a8]">{data.message || "Chưa cấu hình lương"}</div>
            )}
          </div>

          <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="mb-3 text-sm font-semibold text-[#d9def3]">Điểm KPI hiện tại: {data.totalScore}/100</div>
            <div className="grid grid-cols-1 gap-2 text-sm text-[#c8d0ef] md:grid-cols-2">
              <div>Tiến độ: <b>{data.scores.schedule}</b></div>
              <div>QC: <b>{data.scores.qc}</b></div>
              <div>Báo cáo: <b>{data.scores.report}</b></div>
              <div>Chủ nhà: <b>{data.scores.customer}</b></div>
              <div>Đóng góp: <b>{data.scores.contribution ?? "Chưa chấm"}</b></div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
