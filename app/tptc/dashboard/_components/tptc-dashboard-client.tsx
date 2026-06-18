"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fmtMoney, ProjectCard, type ProjectMetrics } from "./project-card";

type DashboardData = {
  role: "construction_manager" | "admin";
  today: string;
  weekKey: string;
  totals: {
    projectsCount: number;
    laborUsedPct: number;
    materialUsedPct: number;
    qcPending: number;
    eodMissingToday: number;
    woCarried: number;
    payrollDraft: number;
  };
  projects: ProjectMetrics[];
  alerts: Array<{ projectId: string; projectCode: string; message: string; severity: "warn" | "danger" }>;
};

type ViewMode = "overview" | "all";

function pctOf(planned: number, used: number) {
  return planned > 0 ? Math.round((used / planned) * 100) : 0;
}

function pctTone(pct: number) {
  if (pct >= 90) return "text-red-300";
  if (pct >= 75) return "text-amber-300";
  return "text-emerald-300";
}

export function TptcDashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") as ViewMode | null) ?? "overview";
  const focusProjectId = searchParams.get("project");

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(focusProjectId);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch("/api/tptc/dashboard", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoading(false);
        toast.error(json.message || "Không tải được dashboard");
        return;
      }
      setLoading(false);
      setData(json);
    }
    load();
  }, []);

  function setView(next: ViewMode) {
    const params = new URLSearchParams();
    if (next !== "overview") params.set("view", next);
    const qs = params.toString();
    router.push(qs ? `/tptc/dashboard?${qs}` : "/tptc/dashboard");
  }

  const focusProject = useMemo(() => {
    if (!focusProjectId || !data) return null;
    return data.projects.find((p) => p.id === focusProjectId) ?? null;
  }, [focusProjectId, data]);

  if (loading) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">Đang tải dashboard điều hành...</div>;
  }
  if (!data) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">Không tải được dashboard.</div>;
  }

  // 1 project alone: focus on it
  if (focusProject) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-orange-300">Chi tiết dự án</h1>
          <Button variant="outline" size="sm" onClick={() => router.push("/tptc/dashboard")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Quay lại Dashboard
          </Button>
        </div>
        <ProjectCard project={focusProject} expanded />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header data={data} view={view} onChangeView={setView} />
      <KpiBar data={data} />

      {view === "overview" && (
        <>
          <ProjectsTable
            data={data}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
          />
          {data.alerts.length > 0 && <AlertList data={data} />}
        </>
      )}

      {view === "all" && (
        <div className="space-y-3">
          {data.projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
          {data.projects.length === 0 && <EmptyState />}
        </div>
      )}
    </div>
  );
}

function Header({ data, view, onChangeView }: { data: DashboardData; view: ViewMode; onChangeView: (v: ViewMode) => void }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-orange-300">Dashboard điều hành</h1>
        <p className="text-xs text-[#8892b0]">
          Hôm nay {data.today} • Tuần {data.weekKey} • {data.totals.projectsCount} dự án đang chạy
        </p>
      </div>
      <div className="inline-flex rounded-lg border border-[#2d3249] bg-[#1a1d2e] p-0.5">
        <button
          type="button"
          onClick={() => onChangeView("overview")}
          className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs ${view === "overview" ? "bg-orange-500/20 text-orange-200" : "text-[#8892b0]"}`}
        >
          <List className="h-3.5 w-3.5" /> Tổng quan
        </button>
        <button
          type="button"
          onClick={() => onChangeView("all")}
          className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs ${view === "all" ? "bg-orange-500/20 text-orange-200" : "text-[#8892b0]"}`}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Toàn bộ
        </button>
      </div>
    </div>
  );
}

function KpiBar({ data }: { data: DashboardData }) {
  const items = [
    {
      label: "Dự án đang chạy",
      value: data.totals.projectsCount,
      tone: "text-sky-300",
      href: "/projects",
    },
    {
      label: "Cảnh báo cần xử lý",
      value: data.alerts.length,
      tone: data.alerts.length > 0 ? "text-red-300" : "text-emerald-300",
      href: null,
    },
    {
      label: "Sản lượng chờ nghiệm thu",
      value: data.totals.qcPending,
      tone: data.totals.qcPending > 0 ? "text-amber-300" : "text-emerald-300",
      href: null,
    },
    {
      label: "Lương tuần đang nháp",
      value: data.totals.payrollDraft,
      tone: data.totals.payrollDraft > 0 ? "text-amber-300" : "text-emerald-300",
      href: null,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => {
        const inner = (
          <Card className="border-[#252840] bg-[#1a1d2e]">
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-[#8892b0]">{item.label}</div>
              <div className={`mt-1 text-3xl font-bold ${item.tone}`}>{item.value}</div>
            </CardContent>
          </Card>
        );
        if (item.href) {
          return (
            <Link key={item.label} href={item.href} className="block">
              {inner}
            </Link>
          );
        }
        return <div key={item.label}>{inner}</div>;
      })}
    </div>
  );
}

function ProjectsTable({ data, expandedId, onToggle }: { data: DashboardData; expandedId: string | null; onToggle: (id: string) => void }) {
  if (data.projects.length === 0) return <EmptyState />;
  return (
    <Card className="border-[#252840] bg-[#1a1d2e]">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#171a27] text-[11px] uppercase text-[#8892b0]">
              <tr>
                <th className="w-6 px-2 py-2"></th>
                <th className="px-3 py-2 text-left">Dự án</th>
                <th className="px-3 py-2 text-left">Kỹ sư phụ trách</th>
                <th className="px-3 py-2 text-left">Tiến độ nhân công</th>
                <th className="px-3 py-2 text-center">Hôm nay</th>
                <th className="px-3 py-2 text-center">Cuối ngày</th>
                <th className="px-3 py-2 text-center">Cảnh báo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#252840]">
              {data.projects.map((p) => {
                const lpct = pctOf(p.budget.labor.planned, p.budget.labor.used);
                const todayClass = p.workOrders.todayOpen > 0 ? "text-amber-300" : p.workOrders.todayTotal > 0 ? "text-emerald-300" : "text-[#8892b0]";
                const expanded = expandedId === p.id;
                return (
                  <>
                    <tr key={p.id} className="cursor-pointer hover:bg-[#22263a]" onClick={() => onToggle(p.id)}>
                      <td className="px-2 py-2 text-center text-[#8892b0]">
                        {expanded ? <ChevronDown className="inline h-4 w-4" /> : <ChevronRight className="inline h-4 w-4" />}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/projects/${p.id}`} className="font-medium text-orange-200 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {p.code}
                        </Link>
                        <div className="text-xs text-[#cdd6f4]">{p.name}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-[#cdd6f4]">
                        {p.mainEngineer ? p.mainEngineer.name : <span className="text-[#8892b0]">—</span>}
                      </td>
                      <td className="px-3 py-2" style={{ minWidth: 200 }}>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#0f1220]">
                            <div
                              className={`h-full ${lpct >= 90 ? "bg-red-500/70" : lpct >= 75 ? "bg-amber-500/70" : "bg-emerald-500/60"}`}
                              style={{ width: `${Math.min(100, lpct)}%` }}
                            />
                          </div>
                          <span className={`w-12 text-right text-xs font-medium ${pctTone(lpct)}`}>{lpct}%</span>
                        </div>
                      </td>
                      <td className={`px-3 py-2 text-center text-sm ${todayClass}`}>
                        {p.workOrders.todayTotal === 0 ? "—" : `${p.workOrders.todayDone}/${p.workOrders.todayTotal}`}
                      </td>
                      <td className="px-3 py-2 text-center text-sm">
                        {p.eod.submittedToday ? (
                          <span className="text-emerald-300">Đã nộp</span>
                        ) : (
                          <span className="text-red-300">Chưa nộp</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-sm">
                        {p.alerts.length > 0 ? (
                          <span className="inline-flex items-center justify-center rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300">
                            {p.alerts.length}
                          </span>
                        ) : (
                          <span className="text-[#8892b0]">—</span>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${p.id}-expand`} className="bg-[#0f1220]">
                        <td colSpan={7} className="px-4 py-3">
                          <ProjectCard project={p} expanded />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertList({ data }: { data: DashboardData }) {
  return (
    <Card className="border-[#252840] bg-[#1a1d2e]">
      <CardContent className="p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
          Cảnh báo cần xử lý ({data.alerts.length})
        </div>
        <ul className="space-y-1.5 text-sm">
          {data.alerts.map((a, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.severity === "danger" ? "bg-red-400" : "bg-amber-400"}`} />
              <Link href={`/projects/${a.projectId}`} className="text-orange-200 hover:underline">{a.projectCode}</Link>
              <span className="text-[#cdd6f4]">— {a.message}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="border-[#252840] bg-[#1a1d2e]">
      <CardContent className="p-6 text-center text-sm text-[#8892b0]">
        Chưa có dự án nào được giao cho TPTC. <Link href="/projects" className="text-orange-300 underline">Xem danh sách dự án</Link>
      </CardContent>
    </Card>
  );
}

// Re-export utility so other files can use it if needed
export { fmtMoney };
