"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
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
    pettyCashPending: number;
  };
  projects: ProjectMetrics[];
  alerts: Array<{ projectId: string; projectCode: string; message: string; severity: "warn" | "danger" }>;
};

export function TptcDashboardClient() {
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

  if (loading) {
    return <div className="rounded-lg border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">Đang tải dashboard điều hành...</div>;
  }
  if (!data) {
    return <div className="rounded-lg border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">Không tải được dashboard.</div>;
  }

  return (
    <div className="space-y-4">
      <Header data={data} />
      <KpiBar data={data} />

      {data.projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {data.projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header({ data }: { data: DashboardData }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-orange-300">Dashboard điều hành</h1>
      <p className="text-xs text-[#8892b0]">
        Hôm nay {data.today} • Tuần {data.weekKey} • {data.totals.projectsCount} dự án đang chạy
      </p>
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
    {
      label: "Yêu cầu chi mua lẻ chờ duyệt",
      value: data.totals.pettyCashPending,
      tone: data.totals.pettyCashPending > 0 ? "text-amber-300" : "text-emerald-300",
      href: "/tptc/petty-cash",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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

function EmptyState() {
  return (
    <Card className="border-[#252840] bg-[#1a1d2e]">
      <CardContent className="p-6 text-center text-sm text-[#8892b0]">
        Chưa có dự án nào được giao cho TPTC. <Link href="/projects" className="text-orange-300 underline">Xem danh sách dự án</Link>
      </CardContent>
    </Card>
  );
}
