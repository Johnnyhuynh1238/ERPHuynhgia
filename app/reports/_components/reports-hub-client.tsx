"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type HubProject = {
  projectId: string;
  projectCode: string;
  projectName: string;
  morning: {
    submitted: boolean;
    submittedAt: string | null;
    isLate: boolean;
    tasksPicked: number;
  };
  evening: {
    totalPicked: number;
    totalUpdated: number;
    completed: boolean;
  };
};

type HubResponse = {
  date: string;
  currentTime: string;
  morningDeadline: string;
  projects: HubProject[];
};

function formatTime(iso: string | null) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function ReportsHubClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HubResponse | null>(null);

  useEffect(() => {
    let ignore = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/reports/projects-today", { cache: "no-store" });
        const json = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(typeof json?.message === "string" ? json.message : "Không tải được danh sách dự án báo cáo");
        }

        if (!ignore) {
          setData(json as HubResponse);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Không tải được danh sách dự án báo cáo");
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
  }, []);

  const deadlineHint = useMemo(() => {
    if (!data) return null;
    const [hh, mm] = data.morningDeadline.split(":").map(Number);
    const [nowHh, nowMm] = data.currentTime.split(":").map(Number);
    const diff = hh * 60 + mm - (nowHh * 60 + nowMm);

    if (diff <= 0) {
      return `Đã quá hạn báo sáng ${Math.abs(diff)} phút`;
    }

    return `Còn ${diff} phút đến hạn báo sáng`;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="text-lg font-bold text-[#f0f2ff]">📋 Báo cáo hôm nay</div>
        <div className="mt-1 text-xs text-[#98a0c2]">{data?.date || "--"}</div>
      </div>

      {data ? (
        <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4 text-sm text-[#d9def3]">
          <div>⏰ {data.currentTime}</div>
          <div className="mt-1 text-xs text-[#98a0c2]">{deadlineHint}</div>
        </div>
      ) : null}

      <div className="space-y-3">
        {(data?.projects || []).map((project) => {
          const morningLabel = !project.morning.submitted
            ? "⚠ Chưa báo cáo"
            : project.morning.isLate
              ? `✅ Đã báo cáo (${formatTime(project.morning.submittedAt)}) · Trễ`
              : `✅ Đã báo cáo (${formatTime(project.morning.submittedAt)})`;

          const completion = project.evening.totalPicked > 0
            ? Math.round((project.evening.totalUpdated / project.evening.totalPicked) * 100)
            : 0;

          return (
            <div key={project.projectId} className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
              <div className="text-sm font-extrabold text-[#fb923c]">{project.projectCode}</div>
              <div className="text-sm font-semibold text-[#f0f2ff]">{project.projectName}</div>

              <div className="mt-3 space-y-1.5 text-sm">
                <div className="text-[#d9def3]">☀️ Sáng: <span className={project.morning.submitted ? "text-emerald-300" : "text-amber-300"}>{morningLabel}</span></div>
                {project.morning.submitted ? <div className="text-xs text-[#98a0c2]">{project.morning.tasksPicked} task được chọn</div> : null}

                <div className="text-[#d9def3]">🌆 Chiều: {project.evening.totalUpdated}/{project.evening.totalPicked} task đã cập nhật</div>
                <div className="h-1.5 w-full overflow-hidden rounded bg-[#11182d]">
                  <div className="h-full rounded bg-[#f97316]" style={{ width: `${completion}%` }} />
                </div>
              </div>

              <Link
                href={`/reports/${project.projectId}`}
                className="mt-3 inline-flex rounded-lg border border-[#f97316]/30 bg-[#f97316]/10 px-3 py-1.5 text-xs font-bold text-[#f97316]"
              >
                Vào báo cáo →
              </Link>
            </div>
          );
        })}
      </div>

      {!loading && data?.projects?.length === 0 ? (
        <div className="rounded-xl border border-[#2f3555] bg-[#171c2f] p-4 text-sm text-[#98a0c2]">Bạn chưa có dự án nào để báo cáo.</div>
      ) : null}

      {loading ? <div className="text-sm text-[#98a0c2]">Đang tải danh sách dự án...</div> : null}
      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
    </div>
  );
}
