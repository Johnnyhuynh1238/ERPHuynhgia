"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DailyRating } from "@prisma/client";
import { EveningReportClient } from "./evening-report-client";

type EveningTemplateResponse = {
  message?: string;
  project?: { id: string; code: string; name: string };
  reportDate?: string;
  isGoLive?: boolean;
  siteRestDay?: { id: string; reason: string; note: string | null } | null;
  morningReport?: { id: string; submittedAt: string | null } | null;
  eveningReport?: {
    id: string;
    submittedAt: string | null;
    isOnTime: boolean;
    issues: string | null;
    overallRating: DailyRating;
    overallNote: string | null;
    sitePhotos: Array<{ id: string; photoUrl: string; thumbnailUrl: string; caption: string | null }>;
  } | null;
  requiresMorning?: boolean;
  tasks?: Array<{
    taskId: string;
    code: string;
    name: string;
    phase: string;
    decision: "WORK" | "PAUSE";
    plannedActivity: string | null;
    pauseReason: string | null;
    pauseNote: string | null;
    completionPercent: number | null;
    actualWork: string;
    issues: string;
    rating: DailyRating | null;
    explanation: string;
    stillPaused: boolean | null;
    actualWorkIfStarted: string;
    taskPhotoIds: string[];
    taskPhotos?: Array<{ id: string; taskId: string; photoUrl: string; thumbnailUrl: string; caption: string | null }>;
    eveningTaskId: string | null;
  }>;
};

export function EveningReportPageClient({ projectId, dateInput }: { projectId: string; dateInput?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<EveningTemplateResponse | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams({ projectId });
      if (dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        query.set("date", dateInput);
      }

      const res = await fetch(`/api/reports/evening/template?${query.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as EveningTemplateResponse;

      if (!mounted) return;

      if (res.status === 403) {
        router.replace("/projects?denied=1");
        return;
      }

      if (!res.ok && res.status !== 409) {
        setError(json.message || "Không thể tải dữ liệu báo cáo chiều");
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
    return <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Đang tải dữ liệu báo cáo chiều...</div>;
  }

  if (error || !payload?.project || !payload.reportDate) {
    return <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error || "Không thể tải báo cáo"}</div>;
  }

  return (
    <EveningReportClient
      project={payload.project}
      reportDate={payload.reportDate}
      isGoLive={Boolean(payload.isGoLive)}
      siteRestDay={payload.siteRestDay || null}
      requiresMorning={Boolean(payload.requiresMorning)}
      morningReportSubmittedAt={payload.morningReport?.submittedAt || null}
      eveningReport={
        payload.eveningReport
          ? {
              id: payload.eveningReport.id,
              submittedAt: payload.eveningReport.submittedAt,
              isOnTime: payload.eveningReport.isOnTime,
              issues: payload.eveningReport.issues,
              overallRating: payload.eveningReport.overallRating,
              overallNote: payload.eveningReport.overallNote,
            }
          : null
      }
      initialTasks={(payload.tasks || []).map((task) => ({
        ...task,
        plannedActivity: task.plannedActivity || "",
        pauseNote: task.pauseNote || "",
        actualWork: task.actualWork || "",
        issues: task.issues || "",
        explanation: task.explanation || "",
        actualWorkIfStarted: task.actualWorkIfStarted || "",
        taskPhotoIds: task.taskPhotoIds || [],
        taskPhotos: task.taskPhotos || [],
        markAsDone: task.completionPercent === 100,
      }))}
      initialSitePhotos={payload.eveningReport?.sitePhotos || []}
    />
  );
}
