"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MorningReportClient } from "./morning-report-client";

type MorningTemplateResponse = {
  message?: string;
  project?: { id: string; code: string; name: string };
  reportDate?: string;
  isGoLive?: boolean;
  siteRestDay?: { id: string; reason: string; note: string | null } | null;
  morningReport?: { id: string; submittedAt: string | null; isOnTime: boolean; overallNote: string | null } | null;
  tasks?: Array<{
    taskId: string;
    id: string;
    code: string;
    name: string;
    phase: string;
    status: string;
    group: "A" | "B" | "C";
    overdueDays: number;
    groupOrder: number;
    decision: "WORK" | "PAUSE";
    plannedActivity: string;
    pauseReason: string | null;
    pauseNote: string;
  }>;
};

export function MorningReportPageClient({ projectId, dateInput }: { projectId: string; dateInput?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<MorningTemplateResponse | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams({ projectId });
      if (dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        query.set("date", dateInput);
      }

      const res = await fetch(`/api/reports/morning/template?${query.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as MorningTemplateResponse;

      if (!mounted) return;

      if (res.status === 403) {
        router.replace("/projects?denied=1");
        return;
      }

      if (!res.ok) {
        setError(json.message || "Không thể tải dữ liệu báo cáo sáng");
        setLoading(false);
        return;
      }

      setPayload(json);
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, [projectId, dateInput, router]);

  if (loading) {
    return <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Đang tải dữ liệu báo cáo sáng...</div>;
  }

  if (error || !payload?.project || !payload.reportDate) {
    return <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error || "Không thể tải báo cáo"}</div>;
  }

  return (
    <MorningReportClient
      project={payload.project}
      reportDate={payload.reportDate}
      isGoLive={Boolean(payload.isGoLive)}
      siteRestDay={payload.siteRestDay || null}
      morningReport={payload.morningReport || null}
      initialTasks={(payload.tasks || []).map((task) => ({
        ...task,
        taskId: task.id,
        plannedActivity: task.plannedActivity || "",
        pauseNote: task.pauseNote || "",
      }))}
    />
  );
}
