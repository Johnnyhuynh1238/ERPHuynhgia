"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, LayoutGrid, List, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectCard, type ProjectMetrics } from "./project-card";

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

type ViewMode = "overview" | "detail" | "all";

function fmtMoney(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}tr`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toString();
}

function toneClass(tone: "good" | "warn" | "danger" | "info"): string {
  if (tone === "danger") return "text-red-300";
  if (tone === "warn") return "text-amber-300";
  if (tone === "info") return "text-sky-300";
  return "text-emerald-300";
}

export function TptcDashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") as ViewMode | null) ?? "overview";
  const projectId = searchParams.get("project");

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

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

  function setView(next: ViewMode, pid?: string) {
    const params = new URLSearchParams();
    if (next !== "overview") params.set("view", next);
    if (next === "detail" && pid) params.set("project", pid);
    const qs = params.toString();
    router.push(qs ? `/tptc/dashboard?${qs}` : "/tptc/dashboard");
  }

  const selectedProject = useMemo(() => {
    if (view !== "detail" || !projectId || !data) return null;
    return data.projects.find((p) => p.id === projectId) ?? null;
  }, [view, projectId, data]);

  if (loading) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">Đang tải dashboard TPTC...</div>;
  }
  if (!data) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">Không tải được dashboard.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-orange-300">Dashboard TPTC</h1>
          <p className="text-xs text-[#8892b0]">
            Hôm nay {data.today} • Tuần {data.weekKey} • {data.totals.projectsCount} dự án đang chạy
          </p>
        </div>
        <div className="flex items-center gap-2">
          {view === "detail" && (
            <Button variant="outline" size="sm" onClick={() => setView("overview")} className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Dashboard
            </Button>
          )}
          <div className="inline-flex rounded-lg border border-[#2d3249] bg-[#1a1d2e] p-0.5">
            <button
              type="button"
              onClick={() => setView("overview")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs ${view === "overview" ? "bg-orange-500/20 text-orange-200" : "text-[#8892b0]"}`}
            >
              <List className="h-3.5 w-3.5" /> Overview
            </button>
            <button
              type="button"
              onClick={() => setView("all")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs ${view === "all" ? "bg-orange-500/20 text-orange-200" : "text-[#8892b0]"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Xem toàn bộ
            </button>
          </div>
        </div>
      </div>

      {view !== "detail" && <KpiBar data={data} />}

      {view === "overview" && (
        <>
          <OverviewTable data={data} onOpenDetail={(pid) => setView("detail", pid)} />
          {data.alerts.length > 0 && <AlertList data={data} />}
        </>
      )}

      {view === "all" && (
        <div className="space-y-4">
          {data.projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
          {data.projects.length === 0 && <EmptyState />}
        </div>
      )}

      {view === "detail" && selectedProject && (
        <div className="space-y-4">
          <ProjectCard project={selectedProject} expanded />
        </div>
      )}

      {view === "detail" && !selectedProject && (
        <Card className="border-[#252840] bg-[#1a1d2e]">
          <CardContent className="p-4 text-sm text-[#8892b0]">Không tìm thấy dự án. <button className="underline" onClick={() => setView("overview")}>Quay lại Dashboard</button></CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiBar({ data }: { data: DashboardData }) {
  const items = [
    { label: "Dự án đang chạy", value: data.totals.projectsCount, tone: "info" as const, href: "/projects" },
    { label: "% NC đã dùng", value: `${data.totals.laborUsedPct}%`, tone: data.totals.laborUsedPct >= 90 ? ("danger" as const) : data.totals.laborUsedPct >= 75 ? ("warn" as const) : ("good" as const), href: null },
    { label: "% VT đã dùng", value: `${data.totals.materialUsedPct}%`, tone: data.totals.materialUsedPct >= 90 ? ("danger" as const) : data.totals.materialUsedPct >= 75 ? ("warn" as const) : ("good" as const), href: null },
    { label: "QC chờ duyệt", value: data.totals.qcPending, tone: data.totals.qcPending > 0 ? ("warn" as const) : ("good" as const), href: null },
    { label: "EOD chưa nộp hôm nay", value: data.totals.eodMissingToday, tone: data.totals.eodMissingToday > 0 ? ("danger" as const) : ("good" as const), href: null },
    { label: "WO carried", value: data.totals.woCarried, tone: data.totals.woCarried > 0 ? ("warn" as const) : ("good" as const), href: null },
    { label: "Lương tuần draft", value: data.totals.payrollDraft, tone: data.totals.payrollDraft > 0 ? ("info" as const) : ("good" as const), href: null },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
      {items.map((item) => {
        const inner = (
          <Card className="border-[#252840] bg-[#1a1d2e]">
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-[#8892b0]">{item.label}</div>
              <div className={`mt-1 text-2xl font-bold ${toneClass(item.tone)}`}>{item.value}</div>
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

function OverviewTable({ data, onOpenDetail }: { data: DashboardData; onOpenDetail: (id: string) => void }) {
  if (data.projects.length === 0) return <EmptyState />;
  return (
    <Card className="border-[#252840] bg-[#1a1d2e]">
      <CardHeader className="pb-2">
        <CardTitle>Dự án đang chạy</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#171a27] text-[11px] uppercase text-[#8892b0]">
              <tr>
                <th className="px-3 py-2 text-left">Dự án</th>
                <th className="px-2 py-2 text-right">% NC</th>
                <th className="px-2 py-2 text-right">% VT</th>
                <th className="px-2 py-2 text-right">% MM</th>
                <th className="px-2 py-2 text-right">WO hôm nay</th>
                <th className="px-2 py-2 text-right">Carried</th>
                <th className="px-2 py-2 text-right">QC chờ</th>
                <th className="px-2 py-2 text-right">EOD</th>
                <th className="px-2 py-2 text-right">Lương tuần</th>
                <th className="px-2 py-2 text-left">KS</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#252840]">
              {data.projects.map((p) => {
                const lp = p.budget.labor.planned;
                const mp = p.budget.material.planned;
                const ep = p.budget.equipment.planned;
                const lpct = lp > 0 ? Math.round((p.budget.labor.used / lp) * 100) : 0;
                const mpct = mp > 0 ? Math.round((p.budget.material.used / mp) * 100) : 0;
                const epct = ep > 0 ? Math.round((p.budget.equipment.used / ep) * 100) : 0;
                const pctClass = (v: number) => (v >= 90 ? "text-red-300" : v >= 75 ? "text-amber-300" : "text-emerald-300");
                const woClass = p.workOrders.todayOpen > 0 ? "text-amber-300" : "text-[#cdd6f4]";
                const carriedClass = p.workOrders.carried > 0 ? "text-amber-300" : "text-[#8892b0]";
                const qcClass = p.qc.pendingReview > 0 ? "text-amber-300" : "text-[#8892b0]";
                const eodClass = p.eod.submittedToday ? "text-emerald-300" : "text-red-300";
                const payrollStatusLabel = p.payroll.status === "missing" ? "—" : p.payroll.status === "draft" ? "Nháp" : p.payroll.status === "ready_to_pay" ? "Chờ chi" : "Đã chi";
                return (
                  <tr key={p.id} className="hover:bg-[#22263a]">
                    <td className="px-3 py-2">
                      <Link href={`/projects/${p.id}`} className="font-medium text-orange-200 hover:underline">
                        {p.code}
                      </Link>
                      <div className="text-xs text-[#8892b0]">{p.name}</div>
                    </td>
                    <td className={`px-2 py-2 text-right ${pctClass(lpct)}`}>
                      <Link href={`/projects/${p.id}/budget`} className="hover:underline">{lpct}%</Link>
                    </td>
                    <td className={`px-2 py-2 text-right ${pctClass(mpct)}`}>
                      <Link href={`/projects/${p.id}/budget`} className="hover:underline">{mpct}%</Link>
                    </td>
                    <td className={`px-2 py-2 text-right ${pctClass(epct)}`}>
                      <Link href={`/projects/${p.id}/budget`} className="hover:underline">{epct}%</Link>
                    </td>
                    <td className={`px-2 py-2 text-right ${woClass}`}>
                      <Link href={`/projects/${p.id}/work-orders`} className="hover:underline">{p.workOrders.todayDone}/{p.workOrders.todayTotal}</Link>
                    </td>
                    <td className={`px-2 py-2 text-right ${carriedClass}`}>
                      <Link href={`/projects/${p.id}/work-orders?status=carried`} className="hover:underline">{p.workOrders.carried}</Link>
                    </td>
                    <td className={`px-2 py-2 text-right ${qcClass}`}>
                      <Link href={`/projects/${p.id}/eod`} className="hover:underline">{p.qc.pendingReview}</Link>
                    </td>
                    <td className={`px-2 py-2 text-right ${eodClass}`}>
                      <Link href={`/projects/${p.id}/eod`} className="hover:underline">{p.eod.submittedToday ? "✓" : "✕"}</Link>
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-[#cdd6f4]">
                      <Link href={`/projects/${p.id}/payroll?week=${p.payroll.weekKey}`} className="hover:underline">
                        {fmtMoney(p.payroll.totalPayable)} · {payrollStatusLabel}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {p.mainEngineer ? (
                        <Link href={`/projects/${p.id}/members`} className="text-[#cdd6f4] hover:underline">{p.mainEngineer.name}</Link>
                      ) : (
                        <span className="text-[#8892b0]">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenDetail(p.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#2d3249] px-2 py-1 text-xs text-[#cdd6f4] hover:bg-[#22263a]"
                      >
                        <Maximize2 className="h-3 w-3" /> Chi tiết
                      </button>
                    </td>
                  </tr>
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
      <CardHeader className="pb-2">
        <CardTitle className="text-amber-300">Cảnh báo cần xử lý ({data.alerts.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm">
          {data.alerts.map((a, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.severity === "danger" ? "bg-red-400" : "bg-amber-400"}`} />
              <Link href={`/tptc/dashboard?view=detail&project=${a.projectId}`} className="text-orange-200 hover:underline">{a.projectCode}</Link>
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
        Chưa có dự án nào được gán cho TPTC. <Link href="/projects" className="text-orange-300 underline">Xem danh sách dự án</Link>
      </CardContent>
    </Card>
  );
}
