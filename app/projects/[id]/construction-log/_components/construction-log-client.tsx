"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type TimelineTaskWork = {
  taskId: string;
  code: string;
  name: string;
  plannedActivity: string | null;
  completionPercent: number | null;
  actualWork: string | null;
  actualWorkIfStarted: string | null;
  issues: string | null;
  rating: "MET" | "UNDER" | "OVER" | null;
  explanation: string | null;
  taskPhotos: Array<{
    id: string;
    photoUrl: string;
    thumbnailUrl: string;
    caption: string | null;
  }>;
};

type TimelinePausedTask = {
  taskId: string;
  code: string;
  name: string;
  pauseReason: string | null;
  pauseNote: string | null;
  stillPaused: boolean | null;
};

type TimelineRow = {
  date: string;
  reporter: { id: string; fullName: string };
  morning: {
    id: string;
    submittedAt: string | null;
    isOnTime: boolean;
    overallNote: string | null;
  } | null;
  evening: {
    id: string;
    submittedAt: string | null;
    isOnTime: boolean;
    overallRating: "MET" | "UNDER" | "OVER";
    overallNote: string | null;
    issues: string | null;
  } | null;
  taskWork: TimelineTaskWork[];
  pausedTasks: TimelinePausedTask[];
  sitePhotos: Array<{
    id: string;
    photoUrl: string;
    thumbnailUrl: string;
    caption: string | null;
  }>;
};

type ConstructionLogResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    goLiveDate: string | null;
  };
  range: {
    from: string;
    to: string;
  };
  timeline: TimelineRow[];
};

function ymdInput(date: Date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function defaultRange(goLiveDate: string | null) {
  const today = new Date();
  const to = ymdInput(today);
  const fallbackFrom = ymdInput(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 30, 0, 0, 0)));
  if (!goLiveDate) {
    return { from: fallbackFrom, to };
  }

  const goLive = new Date(goLiveDate);
  return {
    from: ymdInput(goLive > new Date(to) ? new Date(to) : goLive),
    to,
  };
}

function fmtDate(dateYmd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return dateYmd;
  const [yyyy, mm, dd] = dateYmd.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function fmtWeekdayVi(dateYmd: string) {
  const d = new Date(`${dateYmd}T00:00:00Z`);
  return d.toLocaleDateString("vi-VN", { weekday: "long", timeZone: "UTC" });
}

function fmtSubmit(submittedAt: string | null, isOnTime: boolean) {
  if (!submittedAt) return "-";
  const d = new Date(submittedAt);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} ${isOnTime ? "✓" : "(trễ)"}`;
}

function ratingLabel(value: "MET" | "UNDER" | "OVER" | null | undefined) {
  if (value === "MET") return "✅ Đạt kế hoạch";
  if (value === "OVER") return "🎉 Vượt kế hoạch";
  if (value === "UNDER") return "⚠️ Không đạt kế hoạch";
  return "-";
}

function pauseStateLabel(value: boolean | null) {
  if (value === true) return "Vẫn tạm dừng";
  if (value === false) return "Đã bắt đầu lại";
  return "-";
}

export function ConstructionLogClient({
  project,
  initialFrom,
  initialTo,
  canExportPdf,
  canExportXlsx,
}: {
  project: { id: string; code: string; name: string; goLiveDate: string | null };
  initialFrom: string;
  initialTo: string;
  canExportPdf: boolean;
  canExportXlsx: boolean;
}) {
  const fallback = defaultRange(project.goLiveDate);
  const [from, setFrom] = useState(initialFrom || fallback.from);
  const [to, setTo] = useState(initialTo || fallback.to);
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);

  async function loadData() {
    setLoading(true);
    const query = new URLSearchParams({ from, to });
    const res = await fetch(`/api/projects/${project.id}/construction-log?${query.toString()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as ConstructionLogResponse & { message?: string };
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được nhật ký thi công");
      return;
    }

    setTimeline(json.timeline || []);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rangeQuery = useMemo(() => {
    const q = new URLSearchParams({ from, to });
    return q.toString();
  }, [from, to]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs text-slate-500">{project.code}</div>
            <h2 className="text-2xl font-semibold text-orange-300">Nhật ký thi công</h2>
            <div className="text-sm text-slate-600">{project.name}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canExportPdf ? (
              <a href={`/api/projects/${project.id}/construction-log/export?format=pdf&${rangeQuery}`}>
                <Button variant="outline">Xuất PDF nhật ký thi công</Button>
              </a>
            ) : null}
            {canExportXlsx ? (
              <a href={`/api/projects/${project.id}/construction-log/export?format=xlsx&${rangeQuery}`}>
                <Button variant="outline">Xuất Excel</Button>
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="grid gap-2 md:grid-cols-4">
          <input type="date" className="rounded border px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="rounded border px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          <div className="rounded border px-3 py-2 text-sm text-slate-600">Từ {fmtDate(from)} đến {fmtDate(to)}</div>
          <Button className="bg-orange-500 hover:bg-orange-600" onClick={loadData} disabled={loading}>
            {loading ? "Đang tải..." : "Lọc dữ liệu"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Đang tải timeline...</div>
      ) : timeline.length === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Không có dữ liệu trong khoảng thời gian đã chọn.</div>
      ) : (
        <div className="space-y-4">
          {timeline.map((row) => (
            <div key={row.date} className="rounded-xl border bg-white p-4">
              <div className="border-b pb-3">
                <div className="text-lg font-semibold">📅 {fmtWeekdayVi(row.date)}, {fmtDate(row.date)}</div>
                <div className="mt-1 text-sm text-slate-700">Chỉ huy: {row.reporter.fullName || "-"}</div>
                <div className="mt-1 text-sm text-slate-600">
                  Báo cáo sáng: {fmtSubmit(row.morning?.submittedAt || null, Boolean(row.morning?.isOnTime))} | Báo cáo chiều: {fmtSubmit(row.evening?.submittedAt || null, Boolean(row.evening?.isOnTime))}
                </div>
                <div className="mt-1 text-sm text-slate-700">Đánh giá ngày: {ratingLabel(row.evening?.overallRating)}</div>
              </div>

              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <div className="mb-1 font-medium">🏗️ Task đã làm</div>
                  {row.taskWork.length ? (
                    <div className="space-y-2">
                      {row.taskWork.map((task) => (
                        <div key={task.taskId} className="rounded border p-3">
                          <div className="font-medium">[{task.code}] {task.name}</div>
                          <div className="text-slate-700">Kế hoạch sáng: {task.plannedActivity || "-"}</div>
                          <div className="text-slate-700">Thực tế: {task.actualWork || task.actualWorkIfStarted || "-"}</div>
                          <div className="text-slate-700">Đánh giá: {ratingLabel(task.rating)}</div>
                          <div className="text-slate-700">Tiến độ: {task.completionPercent != null ? `${task.completionPercent}%` : "-"}</div>
                          {task.issues ? <div className="text-slate-700">Phát sinh: {task.issues}</div> : null}
                          {task.taskPhotos.length ? (
                            <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-6">
                              {task.taskPhotos.map((photo) => (
                                <a key={photo.id} href={photo.photoUrl} target="_blank" rel="noreferrer">
                                  <Image src={photo.thumbnailUrl} alt="task" width={160} height={160} className="h-20 w-full rounded object-cover" />
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-500">-</div>
                  )}
                </div>

                <div>
                  <div className="mb-1 font-medium">⏸️ Task tạm dừng</div>
                  {row.pausedTasks.length ? (
                    <div className="space-y-2">
                      {row.pausedTasks.map((task) => (
                        <div key={task.taskId} className="rounded border p-3">
                          <div className="font-medium">[{task.code}] {task.name}</div>
                          <div>Lý do: {task.pauseReason || "-"}</div>
                          <div>Ghi chú: {task.pauseNote || "-"}</div>
                          <div>Chiều: {pauseStateLabel(task.stillPaused)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-500">-</div>
                  )}
                </div>

                <div>
                  <div className="mb-1 font-medium">🌆 Ảnh toàn cảnh công trường</div>
                  {row.sitePhotos.length ? (
                    <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                      {row.sitePhotos.map((photo) => (
                        <a key={photo.id} href={photo.photoUrl} target="_blank" rel="noreferrer">
                          <Image src={photo.thumbnailUrl} alt="site" width={180} height={180} className="h-24 w-full rounded object-cover" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-500">-</div>
                  )}
                </div>

                <div>
                  <div className="mb-1 font-medium">📝 Phát sinh trong ngày</div>
                  <div className="rounded border p-3 text-slate-700">{row.evening?.issues || "-"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
