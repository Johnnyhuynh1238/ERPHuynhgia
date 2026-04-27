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

export function ReportsOverviewClient({
  dateLabel,
  summary,
  rows,
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
  subcontractorSpending?: SubcontractorSpendingRow[];
  topSubcontractors?: TopSubcontractorRow[];
}) {
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      const haystack = `${row.projectCode} ${row.projectName} ${row.reportName}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <h1 className="text-xl font-bold text-[#f0f2ff]">Báo cáo</h1>
        <p className="mt-1 text-sm text-[#8892b0]">Tổng hợp tình trạng báo cáo trong ngày {dateLabel}.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="text-xs text-[#8892b0]">Tổng số báo cáo hôm nay</div>
          <div className="mt-1 text-3xl font-bold text-[#fb923c]">{summary.totalReports}</div>
        </div>
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="text-xs text-[#8892b0]">Đã hoàn thành</div>
          <div className="mt-1 text-3xl font-bold text-emerald-300">{summary.completedReports}</div>
        </div>
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="text-xs text-[#8892b0]">Chưa báo cáo</div>
          <div className="mt-1 text-3xl font-bold text-amber-300">{summary.pendingReports}</div>
        </div>
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="text-xs text-[#8892b0]">% KPI báo cáo</div>
          <div className="mt-1 text-3xl font-bold text-blue-300">{summary.kpiPercent.toFixed(2)}%</div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <input
            className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm md:col-span-2"
            placeholder="Tìm theo mã dự án / tên dự án / tên báo cáo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#8892b0]">Hiển thị {filteredRows.length} dòng</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-[#252840] bg-[#171a27] text-left text-[#8892b0]">
                <th className="px-3 py-2">Dự án</th>
                <th className="px-3 py-2">Tên báo cáo</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-[#8892b0]" colSpan={4}>
                    Không có dữ liệu phù hợp.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.key} className="border-b border-[#252840] last:border-b border-[#252840]-0">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[#fb923c]">{row.projectCode}</div>
                      <div className="text-xs text-[#8892b0]">{row.projectName}</div>
                    </td>
                    <td className="px-3 py-2">{row.reportName}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          row.status === "completed" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {row.status === "completed" ? "Hoàn thành" : "Chưa hoàn thành"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Link href={row.targetHref}>
                          <Button variant="outline" className="h-8">
                            Xem
                          </Button>
                        </Link>
                        <Link href={row.targetHref}>
                          <Button variant="outline" className="h-8">
                            Sửa
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          className="h-8 text-red-600 hover:text-red-700"
                          onClick={async () => {
                            const ok = window.confirm(`Xác nhận xoá ${row.reportName.toLowerCase()} của dự án ${row.projectCode}?`);
                            if (!ok) return;

                            const endpoint = row.reportType === "morning" ? "/api/reports/morning" : "/api/reports/evening";
                            const res = await fetch(endpoint, {
                              method: "DELETE",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ projectId: row.projectId }),
                            });
                            const json = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              window.alert(json.message || "Không thể xoá báo cáo");
                              return;
                            }

                            window.location.reload();
                          }}
                        >
                          Xoá
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                <div className="mt-1 text-xs text-[#8892b0]">
                  ĐTB: {row.avgRating !== null ? row.avgRating.toFixed(2) : "-"} • Đánh giá: {row.evaluationCount} • HĐ: {row.totalContracts} • Hire lại: {row.willHireAgainRate}%
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
