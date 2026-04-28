"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type ReportRow = {
  key: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  reportType: "morning" | "evening";
  reportName: string;
  status: "completed" | "pending";
  targetHref: string;
  submittedAt?: string | null;
};

type SubcontractorSpendingRow = {
  projectId: string;
  projectCode: string;
  projectName: string;
  subcontractorId: string;
  subcontractorCode: string;
  subcontractorName: string;
  totalPaid: number;
  paymentCount: number;
};

type TopSubcontractorRow = {
  id: string;
  code: string;
  name: string;
  avgRating: number | null;
  totalContracts: number;
  evaluationCount: number;
  willHireAgainRate: number;
};

function fmtMoney(value: number) {
  return `${Math.round(value).toLocaleString("vi-VN")} đ`;
}

function fmtTime(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function getVnHour() {
  const now = new Date();
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}

export function ReportsOverviewClient({
  dateLabel,
  summary,
  rows,
  role,
  subcontractorSpending = [],
  topSubcontractors = [],
}: {
  dateLabel: string;
  summary: {
    totalReports: number;
    completedReports: number;
    pendingReports: number;
    kpiPercent: number;
  };
  rows: ReportRow[];
  role: string;
  subcontractorSpending?: SubcontractorSpendingRow[];
  topSubcontractors?: TopSubcontractorRow[];
}) {
  const [search, setSearch] = useState("");
  const isEngineer = role === "engineer";

  const vnHour = getVnHour();

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? rows.filter((row) => `${row.projectCode} ${row.projectName} ${row.reportName}`.toLowerCase().includes(q))
      : rows;

    if (!isEngineer) return base;

    return [...base].sort((a, b) => {
      const aOpen = a.reportType === "morning" || vnHour >= 14;
      const bOpen = b.reportType === "morning" || vnHour >= 14;
      const aRank = a.status === "pending" ? (aOpen ? 0 : 2) : 1;
      const bRank = b.status === "pending" ? (bOpen ? 0 : 2) : 1;
      if (aRank !== bRank) return aRank - bRank;
      return a.projectCode.localeCompare(b.projectCode, "vi");
    });
  }, [rows, search, isEngineer, vnHour]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <h1 className="text-xl font-bold text-[#f0f2ff]">Báo cáo hôm nay</h1>
        <p className="mt-1 text-sm text-[#8892b0]">Ngày {dateLabel}</p>
      </div>

      {isEngineer ? (
        <>
          <div className="space-y-3">
            {filteredRows.map((row) => {
              const isOpen = row.reportType === "morning" || vnHour >= 14;
              const isCompleted = row.status === "completed";
              const isOverdue = row.status === "pending" && row.reportType === "morning" && vnHour >= 8;

              const borderClass = isCompleted
                ? "border-l-[var(--green)]"
                : !isOpen
                  ? "border-l-[var(--border)]"
                  : isOverdue
                    ? "border-l-[var(--red)]"
                    : "border-l-[var(--orange)]";

              const statusText = isCompleted
                ? `✅ Đã nộp lúc ${fmtTime(row.submittedAt)}`
                : !isOpen
                  ? "⏳ Mở lúc 14:00"
                  : isOverdue
                    ? "Trạng thái: Quá hạn chưa nộp"
                    : row.reportType === "morning"
                      ? "Hạn: trước 8:00 hôm nay"
                      : "Trạng thái: Chưa nộp";

              const actionLabel = isCompleted ? "Xem lại" : "Nộp →";

              return (
                <div
                  key={row.key}
                  className={`rounded-2xl border border-[#252840] border-l-4 bg-[#1a1d2e] p-4 ${borderClass} ${!isOpen && !isCompleted ? "opacity-70" : ""}`}
                >
                  <div className="text-base font-semibold text-[#f0f2ff]">{row.reportType === "morning" ? "☀️ Báo cáo sáng" : "🌆 Báo cáo chiều"}</div>
                  <div className="mt-1 text-sm text-[#d9def3]">{row.projectCode} – {row.projectName}</div>
                  <div className={`mt-2 text-sm ${isCompleted ? "text-emerald-300" : isOverdue ? "text-red-300" : "text-[#fb923c]"}`}>{statusText}</div>

                  {isCompleted || isOpen ? (
                    <div className="mt-3">
                      <Link href={row.targetHref}>
                        <Button variant="outline" className="h-9">{actionLabel}</Button>
                      </Link>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className={`rounded-2xl border p-4 ${summary.pendingReports === 0 ? "border-emerald-500/30 bg-emerald-500/10" : "border-[#f97316]/30 bg-[#f97316]/10"}`}>
            {summary.pendingReports === 0 ? (
              <div className="text-emerald-300">
                <div className="font-semibold">✅ Bạn đã hoàn thành tất cả</div>
                <div className="text-sm">báo cáo hôm nay: {summary.completedReports}/{summary.totalReports}</div>
              </div>
            ) : (
              <div className="text-[#fb923c]">
                <div className="font-semibold">⚠️ Bạn còn {summary.pendingReports}/{summary.totalReports} báo cáo chưa làm</div>
                <div className="text-sm">Hãy hoàn thành trước khi hết hạn</div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4"><div className="text-xs text-[#8892b0]">Tổng số báo cáo hôm nay</div><div className="mt-1 text-3xl font-bold text-[#fb923c]">{summary.totalReports}</div></div>
            <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4"><div className="text-xs text-[#8892b0]">Đã hoàn thành</div><div className="mt-1 text-3xl font-bold text-emerald-300">{summary.completedReports}</div></div>
            <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4"><div className="text-xs text-[#8892b0]">Chưa báo cáo</div><div className="mt-1 text-3xl font-bold text-amber-300">{summary.pendingReports}</div></div>
            <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4"><div className="text-xs text-[#8892b0]">% KPI báo cáo</div><div className="mt-1 text-3xl font-bold text-blue-300">{summary.kpiPercent.toFixed(2)}%</div></div>
          </div>

          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <input className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm md:col-span-2" placeholder="Tìm theo mã dự án / tên dự án / tên báo cáo" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#8892b0]">Hiển thị {filteredRows.length} dòng</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead><tr className="border-b border-[#252840] bg-[#171a27] text-left text-[#8892b0]"><th className="px-3 py-2">Dự án</th><th className="px-3 py-2">Tên báo cáo</th><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Hành động</th></tr></thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.key} className="border-b border-[#252840]"><td className="px-3 py-2"><div className="font-medium text-[#fb923c]">{row.projectCode}</div><div className="text-xs text-[#8892b0]">{row.projectName}</div></td><td className="px-3 py-2">{row.reportName}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-medium ${row.status === "completed" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{row.status === "completed" ? "Hoàn thành" : "Chưa hoàn thành"}</span></td><td className="px-3 py-2"><Link href={row.targetHref}><Button variant="outline" className="h-8">Xem</Button></Link></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {subcontractorSpending.length > 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <h2 className="mb-3 text-lg font-semibold text-[#f0f2ff]">Chi phí thầu phụ (đã chi)</h2>
          <div className="space-y-2">
            {subcontractorSpending.map((row) => (
              <div key={`${row.projectId}-${row.subcontractorId}`} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm">
                <div className="font-medium text-[#f0f2ff]">{row.projectCode} • {row.subcontractorCode} - {row.subcontractorName}</div>
                <div className="mt-1 text-xs text-[#8892b0]">{row.projectName} • {row.paymentCount} đợt đã chi</div>
                <div className="mt-1 text-sm text-emerald-300">{fmtMoney(row.totalPaid)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {topSubcontractors.length > 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <h2 className="mb-3 text-lg font-semibold text-[#f0f2ff]">Top thầu phụ</h2>
          <div className="space-y-2">
            {topSubcontractors.map((row) => (
              <div key={row.id} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm">
                <div className="font-medium text-[#f0f2ff]">{row.code} - {row.name}</div>
                <div className="mt-1 text-xs text-[#8892b0]">ĐTB: {row.avgRating !== null ? row.avgRating.toFixed(2) : "-"} • Đánh giá: {row.evaluationCount} • HĐ: {row.totalContracts} • Hire lại: {row.willHireAgainRate}%</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
