"use client";

import { useMemo, useState } from "react";
import { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";

type KpiBreakdown = {
  schedule: number;
  qc: number;
  report: number;
  customer: number;
  contribution: number;
};

type AdminKpiRow = {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  projectId: string;
  projectCode: string;
  projectName: string;
  score: number;
  rank: string;
  breakdown?: KpiBreakdown;
};

type AdminKpiPayload = {
  month: string;
  canSeeDetail: boolean;
  rows: AdminKpiRow[];
  projects: Array<{ id: string; code: string; name: string; goLiveDate: string | null }>;
};

type KpiDetailPayload = {
  month: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
  };
  project: {
    id: string;
    code: string;
    name: string;
  };
  totals: {
    score: number;
    rank: string;
  };
  breakdown: KpiBreakdown;
  history: Array<{ month: string; score: number; rank: string }>;
};

function rankClass(rank: string) {
  if (rank === "A") return "bg-emerald-500/15 text-emerald-300";
  if (rank === "B") return "bg-blue-500/15 text-blue-300";
  if (rank === "C") return "bg-amber-500/15 text-amber-300";
  return "bg-red-500/15 text-red-300";
}

function roleLabel(role: UserRole) {
  if (role === UserRole.engineer) return "Engineer";
  if (role === UserRole.construction_manager) return "TPTC";
  if (role === UserRole.admin) return "Admin";
  if (role === UserRole.accountant) return "Kế toán";
  return "Foreman";
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

const METRIC_LABELS: Record<keyof KpiBreakdown, string> = {
  schedule: "KPI 1 · Tiến độ",
  qc: "KPI 2 · Chất lượng QC",
  report: "KPI 3 · Báo cáo",
  customer: "KPI 4 · Chủ nhà",
  contribution: "KPI 5 · Đóng góp",
};

const METRIC_KEYS = Object.keys(METRIC_LABELS) as Array<keyof KpiBreakdown>;

export function AdminKpiClient({ initialData, canSeeDetail }: { initialData: AdminKpiPayload; canSeeDetail: boolean }) {
  const [month, setMonth] = useState(initialData.month);
  const [projectId, setProjectId] = useState("");
  const [role, setRole] = useState<"" | "engineer" | "construction_manager">("");
  const [rows, setRows] = useState(initialData.rows);
  const [selected, setSelected] = useState<AdminKpiRow | null>(null);
  const [detailPayload, setDetailPayload] = useState<KpiDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [apiCanSeeDetail, setApiCanSeeDetail] = useState(initialData.canSeeDetail ?? canSeeDetail);

  async function search() {
    setLoading(true);
    const query = new URLSearchParams({ month });
    if (projectId) query.set("projectId", projectId);
    if (role) query.set("role", role);

    const res = await fetch(`/api/kpi/users?${query.toString()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as AdminKpiPayload;
    setLoading(false);

    if (!res.ok) return;
    setRows(json.rows || []);
    setApiCanSeeDetail(Boolean(json.canSeeDetail));
    setSelected(null);
    setDetailPayload(null);
  }

  async function openDetail(row: AdminKpiRow) {
    if (!canSeeDetail || !apiCanSeeDetail) return;

    setSelected(row);
    setDetailLoading(true);

    const query = new URLSearchParams({
      month,
      projectId: row.projectId,
    });

    const res = await fetch(`/api/kpi/users/${row.userId}?${query.toString()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as KpiDetailPayload;
    setDetailLoading(false);

    if (!res.ok) return;
    setDetailPayload(json);
  }

  const sortedRows = useMemo(() => [...rows].sort((a, b) => b.score - a.score), [rows]);

  const chartPoints = useMemo(() => toLinePoints(detailPayload?.history || []), [detailPayload?.history]);

  function exportExcel() {
    const query = new URLSearchParams({ month });
    if (projectId) query.set("projectId", projectId);
    if (role) query.set("role", role);
    window.location.href = `/api/kpi/users/export/xlsx?${query.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#f0f2ff]">KPI toàn công ty</h1>
          <Button variant="outline" onClick={exportExcel}>
            Xuất Excel
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <input type="month" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
          <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Tất cả dự án</option>
            {initialData.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} - {project.name}
              </option>
            ))}
          </select>
          <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as "" | "engineer" | "construction_manager")}>
            <option value="">Tất cả role</option>
            <option value="engineer">Engineer</option>
            <option value="construction_manager">TPTC</option>
          </select>
          <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" disabled={loading} onClick={search}>
            {loading ? "Đang tải..." : "Lọc dữ liệu"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-[#171a27] text-[#8892b0]">
              <tr>
                <th className="px-3 py-2 text-left">Họ tên</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Dự án</th>
                <th className="px-3 py-2 text-left">KPI tháng</th>
                <th className="px-3 py-2 text-left">Xếp hạng</th>
                <th className="px-3 py-2 text-left">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={`${row.userId}_${row.projectId}`} className="border-b border-[#252840]">
                  <td className="px-3 py-2">{row.fullName}</td>
                  <td className="px-3 py-2">{row.email}</td>
                  <td className="px-3 py-2">{roleLabel(row.role)}</td>
                  <td className="px-3 py-2">
                    {row.projectCode} - {row.projectName}
                  </td>
                  <td className="px-3 py-2 font-medium">{row.score.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${rankClass(row.rank)}`}>{row.rank}</span>
                  </td>
                  <td className="px-3 py-2">
                    {canSeeDetail && apiCanSeeDetail ? (
                      <Button variant="outline" onClick={() => openDetail(row)}>
                        Xem
                      </Button>
                    ) : (
                      <span className="text-xs text-[#8892b0]">Ẩn theo phân quyền</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && canSeeDetail && apiCanSeeDetail ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
          <div className="w-full max-w-4xl rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <h3 className="mb-3 text-lg font-semibold">
              Chi tiết KPI · {selected.fullName} · {selected.projectCode}
            </h3>

            {detailLoading ? (
              <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-4 text-sm text-[#8892b0]">Đang tải chi tiết...</div>
            ) : detailPayload ? (
              <div className="space-y-4">
                <div className="grid gap-2 md:grid-cols-2">
                  {METRIC_KEYS.map((metricKey) => (
                    <div key={metricKey} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm">
                      {METRIC_LABELS[metricKey]}: {Number(detailPayload.breakdown[metricKey] || 0).toFixed(2)}
                    </div>
                  ))}
                </div>

                <div>
                  <div className="mb-2 font-medium">Xu hướng 6 tháng gần nhất</div>
                  {detailPayload.history.length ? (
                    <div className="w-full overflow-x-auto rounded-xl border border-[#2d3249] bg-[#13151f] p-2">
                      <svg viewBox="0 0 640 220" className="h-[220px] min-w-[640px] w-full">
                        <line x1="28" y1="28" x2="28" y2="192" stroke="#e2e8f0" strokeWidth="1" />
                        <line x1="28" y1="192" x2="612" y2="192" stroke="#e2e8f0" strokeWidth="1" />
                        <line x1="28" y1="110" x2="612" y2="110" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                        <polyline fill="none" stroke="#f97316" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={chartPoints} />
                        {detailPayload.history.map((row, index) => {
                          const x = 28 + (detailPayload.history.length === 1 ? 584 / 2 : (index * 584) / (detailPayload.history.length - 1));
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
                  ) : (
                    <div className="text-sm text-[#8892b0]">Chưa có dữ liệu.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-4 text-sm text-[#8892b0]">Không tải được chi tiết KPI.</div>
            )}

            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setSelected(null);
                  setDetailPayload(null);
                }}
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
