"use client";

import { useCallback, useEffect, useState } from "react";

type EveningTaskRow = {
  taskId: string;
  taskCode: string;
  taskName: string;
  phase: string;
  report: {
    exists: boolean;
    status: string | null;
    progress: number | null;
    photoCount: number;
    lastUpdatedAt: string | null;
  };
};

type EveningResponse = {
  summary: {
    totalPicked: number;
    totalUpdated: number;
    allCompleted: boolean;
    completionRate: number;
  };
  tasks: EveningTaskRow[];
  kpiToday: {
    morningOnTime: boolean;
    morningComplete: boolean;
    eveningOnTime: boolean | null;
    eveningComplete: boolean;
    currentScore: number;
  };
};

function formatTime(value: string | null) {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function mark(value: boolean | null) {
  if (value === null) return "⏳";
  return value ? "✅" : "❌";
}

export function EveningTab({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EveningResponse | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/reports/evening/${projectId}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Không tải được dữ liệu chiều");
      }

      setData(json as EveningResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu chiều");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="text-sm font-semibold text-[#d9def3]">
          {data?.summary.totalUpdated || 0}/{data?.summary.totalPicked || 0} task đã cập nhật
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded bg-[#11182d]">
          <div className="h-full rounded bg-[#f97316]" style={{ width: `${data?.summary.completionRate || 0}%` }} />
        </div>
      </div>

      {data?.summary.allCompleted ? (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          <div className="font-bold">🎉 ĐÃ HOÀN THÀNH KPI BÁO CÁO HÔM NAY</div>
          <div className="mt-2 space-y-1 text-xs">
            <div>{mark(data.kpiToday.morningOnTime)} Báo cáo sáng đúng giờ</div>
            <div>{mark(data.kpiToday.morningComplete)} Tick đầy đủ task bắt buộc</div>
            <div>{mark(data.kpiToday.eveningOnTime)} Cập nhật chiều đúng giờ</div>
            <div>{mark(data.kpiToday.eveningComplete)} Cập nhật đủ task đã tick</div>
          </div>
          <div className="mt-2 text-sm font-semibold">KPI báo cáo hôm nay: {data.kpiToday.currentScore}/100</div>
        </div>
      ) : null}

      <div className="space-y-2">
        {(data?.tasks || []).map((task) => (
          <div key={task.taskId} className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="text-sm font-bold text-[#f0f2ff]">{task.taskCode} - {task.taskName}</div>
            <div className="mt-0.5 text-xs text-[#98a0c2]">{task.phase}</div>

            {task.report.exists ? (
              <>
                <div className="mt-2 text-sm text-emerald-300">✅ Đã cập nhật {formatTime(task.report.lastUpdatedAt)}</div>
                <div className="mt-1 text-xs text-[#d9def3]">
                  {task.report.status} · {task.report.progress ?? 0}% · {task.report.photoCount} ảnh
                </div>
                <a
                  href={`/tasks/${task.taskId}?tab=technical&subtab=today`}
                  className="mt-3 inline-flex rounded-lg border border-[#2f3555] bg-[#11182d] px-3 py-1.5 text-xs font-semibold text-[#d9def3]"
                >
                  Xem trong task →
                </a>
              </>
            ) : (
              <>
                <div className="mt-2 text-sm text-amber-300">⚠ Chưa cập nhật</div>
                <a
                  href={`/tasks/${task.taskId}?tab=technical&subtab=today`}
                  className="mt-3 inline-flex rounded-lg border border-[#f97316]/30 bg-[#f97316]/10 px-3 py-1.5 text-xs font-semibold text-[#f97316]"
                >
                  Cập nhật ngay →
                </a>
              </>
            )}
          </div>
        ))}
      </div>

      {loading ? <div className="text-sm text-[#98a0c2]">Đang tải dữ liệu chiều...</div> : null}
      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
    </div>
  );
}
