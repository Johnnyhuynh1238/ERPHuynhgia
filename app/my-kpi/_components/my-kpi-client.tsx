"use client";

import { useEffect, useMemo, useState } from "react";
import { DailyRating } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type MyKpiResponse = {
  month: string;
  range: {
    from: string;
    to: string;
  };
  projects: Array<{ id: string; code: string; name: string; goLiveDate: string | null; mainEngineerId: string }>;
  selectedProjectId: string | null;
  totals: { score: number; rank: string };
  weights: {
    schedule: number;
    qc: number;
    report: number;
    customer: number;
    contribution: number;
  };
  breakdown: {
    schedule: number;
    qc: number;
    report: number;
    customer: number;
    contribution: number;
  };
  detail: {
    requiredDays: number;
    morningOnTimeDays: number;
    eveningOnTimeDays: number;
    totalCompletedTasks: number;
    onScheduleTasks: number;
    totalEvening: number;
    metOrOverCount: number;
    totalInspected: number;
    inspectedPassFirstTime: number;
    proactivityRaw: number;
  };
  history: Array<{ month: string; score: number; rank: string }>;
  dailyRows: Array<{
    date: string;
    morningSubmitted: boolean;
    morningOnTime: boolean;
    eveningSubmitted: boolean;
    eveningOnTime: boolean;
    overallRating: DailyRating | null;
  }>;
};

const METRIC_LABELS = {
  schedule: "KPI 1 · Tiến độ",
  qc: "KPI 2 · Chất lượng QC",
  report: "KPI 3 · Báo cáo",
  customer: "KPI 4 · Chủ nhà",
  contribution: "KPI 5 · Đóng góp",
} as const;

const METRIC_KEYS = Object.keys(METRIC_LABELS) as Array<keyof typeof METRIC_LABELS>;

function rankClass(rank: string) {
  if (rank === "A") return "bg-emerald-500/15 text-emerald-300";
  if (rank === "B") return "bg-blue-500/15 text-blue-300";
  if (rank === "C") return "bg-amber-500/15 text-amber-300";
  return "bg-red-500/15 text-red-300";
}

function ratingLabel(value: DailyRating | null) {
  if (!value) return "-";
  if (value === DailyRating.MET) return "Đạt";
  if (value === DailyRating.OVER) return "Vượt";
  return "Không đạt";
}

function formatDate(dateYmd: string) {
  const [yyyy, mm, dd] = dateYmd.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function asMonthInput(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const fromDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const toDate = new Date(Date.UTC(year, month, 0, 0, 0, 0));

  const from = `${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth() + 1).padStart(2, "0")}-${String(fromDate.getUTCDate()).padStart(2, "0")}`;
  const to = `${toDate.getUTCFullYear()}-${String(toDate.getUTCMonth() + 1).padStart(2, "0")}-${String(toDate.getUTCDate()).padStart(2, "0")}`;
  return { from, to };
}

function toLinePoints(history: Array<{ month: string; score: number }>) {
  if (!history.length) return "";

  const width = 640;
  const height = 220;
  const padding = 28;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return history
    .map((row, index) => {
      const x = padding + (history.length === 1 ? usableWidth / 2 : (index * usableWidth) / (history.length - 1));
      const clamped = Math.max(0, Math.min(100, row.score));
      const y = padding + ((100 - clamped) / 100) * usableHeight;
      return `${x},${y}`;
    })
    .join(" ");
}

export function MyKpiClient() {
  const [month, setMonth] = useState(asMonthInput(new Date()));
  const [projectId, setProjectId] = useState("");
  const [from, setFrom] = useState(monthRange(asMonthInput(new Date())).from);
  const [to, setTo] = useState(monthRange(asMonthInput(new Date())).to);
  const [loading, setLoading] = useState(true);
  const [showFormula, setShowFormula] = useState(false);
  const [payload, setPayload] = useState<MyKpiResponse | null>(null);

  useEffect(() => {
    const range = monthRange(month);
    setFrom(range.from);
    setTo(range.to);
  }, [month]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const query = new URLSearchParams({ month, from, to });
      if (projectId) query.set("projectId", projectId);

      const res = await fetch(`/api/kpi/me?${query.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as MyKpiResponse & { message?: string };
      setLoading(false);

      if (!res.ok) {
        toast.error(json.message || "Không thể tải KPI");
        return;
      }

      setPayload(json);
      if (!projectId && json.selectedProjectId) {
        setProjectId(json.selectedProjectId);
      }
    }

    load();
  }, [month, projectId, from, to]);

  const metricRows = useMemo(() => {
    if (!payload) return [];
    return METRIC_KEYS.map((key) => ({
      key,
      label: METRIC_LABELS[key],
      score: Number((payload.breakdown[key] || 0).toFixed(2)),
      weight: payload.weights[key],
    }));
  }, [payload]);

  const chartPoints = useMemo(() => toLinePoints(payload?.history || []), [payload?.history]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-[#f0f2ff]">KPI của tôi</h1>
          <Button variant="outline" onClick={() => setShowFormula(true)}>
            Xem công thức tính
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-5">
          <input type="month" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
          <input type="date" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Tất cả / tự chọn dự án</option>
            {(payload?.projects || []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} - {project.name}
              </option>
            ))}
          </select>
          <div className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#8892b0]">Kỳ: {payload?.range ? `${formatDate(payload.range.from)} - ${formatDate(payload.range.to)}` : month}</div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">Đang tải KPI...</div>
      ) : payload ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
              <div className="text-sm text-[#8892b0]">Điểm KPI tháng</div>
              <div className="mt-2 text-4xl font-bold text-[#fb923c]">{payload.totals.score.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
              <div className="text-sm text-[#8892b0]">Xếp hạng</div>
              <span className={`mt-2 inline-flex rounded-full px-4 py-2 text-xl font-semibold ${rankClass(payload.totals.rank)}`}>{payload.totals.rank}</span>
            </div>
            <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">
              <div>Ngày cần báo cáo: {payload.detail.requiredDays}</div>
              <div>Sáng đúng giờ: {payload.detail.morningOnTimeDays}</div>
              <div>Chiều đúng giờ: {payload.detail.eveningOnTimeDays}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <h2 className="mb-3 font-semibold">Breakdown 5 KPI v2</h2>
            <div className="space-y-2">
              {metricRows.map((row) => (
                <div key={row.key} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>{row.label}</div>
                    <div className="font-medium">
                      {row.score.toFixed(2)} điểm · trọng số {row.weight}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <h2 className="mb-3 font-semibold">Xu hướng 6 tháng gần nhất</h2>
            {payload.history.length ? (
              <div className="space-y-3">
                <div className="w-full overflow-x-auto">
                  <svg viewBox="0 0 640 220" className="h-[220px] min-w-[640px] w-full">
                    <line x1="28" y1="28" x2="28" y2="192" stroke="#e2e8f0" strokeWidth="1" />
                    <line x1="28" y1="192" x2="612" y2="192" stroke="#e2e8f0" strokeWidth="1" />
                    <line x1="28" y1="110" x2="612" y2="110" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                    <polyline fill="none" stroke="#f97316" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={chartPoints} />
                    {payload.history.map((row, index) => {
                      const x = 28 + (payload.history.length === 1 ? 584 / 2 : (index * 584) / (payload.history.length - 1));
                      const y = 28 + ((100 - Math.max(0, Math.min(100, row.score))) / 100) * 164;
                      return (
                        <g key={row.month}>
                          <circle cx={x} cy={y} r="4" fill="#f97316" />
                          <text x={x} y={210} textAnchor="middle" className="fill-slate-500 text-[11px]">
                            {row.month}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {payload.history.map((row) => (
                    <div key={row.month} className="flex items-center justify-between rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm">
                      <div>{row.month}</div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{row.score.toFixed(2)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${rankClass(row.rank)}`}>{row.rank}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-[#8892b0]">Chưa có dữ liệu.</div>
            )}
          </div>

          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <h2 className="mb-3 font-semibold">Chi tiết theo ngày</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-[#171a27] text-[#8892b0]">
                  <tr>
                    <th className="px-3 py-2 text-left">Ngày</th>
                    <th className="px-3 py-2 text-left">Sáng</th>
                    <th className="px-3 py-2 text-left">Sáng đúng giờ</th>
                    <th className="px-3 py-2 text-left">Chiều</th>
                    <th className="px-3 py-2 text-left">Chiều đúng giờ</th>
                    <th className="px-3 py-2 text-left">Đánh giá ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.dailyRows.map((row) => (
                    <tr key={row.date} className="border-b border-[#252840]">
                      <td className="px-3 py-2">{formatDate(row.date)}</td>
                      <td className="px-3 py-2">{row.morningSubmitted ? "Có" : "-"}</td>
                      <td className="px-3 py-2">{row.morningOnTime ? "✓" : "-"}</td>
                      <td className="px-3 py-2">{row.eveningSubmitted ? "Có" : "-"}</td>
                      <td className="px-3 py-2">{row.eveningOnTime ? "✓" : "-"}</td>
                      <td className="px-3 py-2">{ratingLabel(row.overallRating)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {showFormula ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
          <div className="w-full max-w-2xl rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <h3 className="mb-3 text-lg font-semibold">Công thức tính KPI</h3>
            <ul className="space-y-2 text-sm text-[#c8d0e8]">
              <li>• KPI 1 Tiến độ: trung bình điểm task hoàn thành theo mức đúng hạn/trễ hạn.</li>
              <li>• KPI 2 QC: tỷ lệ checklist QC đạt ngay lần đầu.</li>
              <li>• KPI 3 Báo cáo: trung bình đúng giờ/đầy đủ của báo cáo sáng và chiều.</li>
              <li>• KPI 4 Chủ nhà: 50% rating task + 50% rating kỹ sư từ chủ nhà.</li>
              <li>• KPI 5 Đóng góp: điểm TPTC/Admin chấm tay, mặc định 70 khi chưa chấm.</li>
              <li>• Tổng KPI dùng trọng số đang có hiệu lực trong trang Cài đặt KPI.</li>
            </ul>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setShowFormula(false)}>
                Đóng
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
