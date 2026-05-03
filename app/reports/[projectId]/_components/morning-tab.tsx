"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type MorningTask = {
  taskId: string;
  taskCode: string;
  taskName: string;
  progress: number | null;
  daysLate: number | null;
  daysUntil: number | null;
  group: "overdue" | "in_progress" | "starting_today" | "upcoming";
};

type MorningResponse = {
  checkin: {
    exists: boolean;
    submittedAt: string | null;
    isLate: boolean;
    selectedTaskIds: string[];
  };
  groups: {
    overdue: MorningTask[];
    in_progress: MorningTask[];
    starting_today: MorningTask[];
    upcoming: MorningTask[];
  };
};

const GROUP_ORDER: Array<keyof MorningResponse["groups"]> = ["overdue", "in_progress", "starting_today", "upcoming"];

const GROUP_LABELS: Record<keyof MorningResponse["groups"], string> = {
  overdue: "⚠ TRỄ HẠN",
  in_progress: "⚠ ĐANG LÀM DỞ",
  starting_today: "🔵 ĐẾN NGÀY BĐ",
  upcoming: "⏳ SẮP ĐẾN",
};

function formatSubmitStatus(input: { submittedAt: string | null; isLate: boolean }) {
  if (!input.submittedAt) return "";
  const time = new Date(input.submittedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return input.isLate ? `Lúc ${time} (TRỄ)` : `Lúc ${time} (đúng giờ)`;
}

function taskHint(task: MorningTask) {
  if (typeof task.daysLate === "number" && task.daysLate > 0) return `trễ ${task.daysLate} ngày`;
  if (typeof task.progress === "number") return `${task.progress}%`;
  if (typeof task.daysUntil === "number" && task.daysUntil > 0) return `còn ${task.daysUntil} ngày`;
  return "";
}

export function MorningTab({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [data, setData] = useState<MorningResponse | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/reports/morning/${projectId}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Không tải được báo cáo sáng");
      }

      const next = json as MorningResponse;
      setData(next);
      const selected = Object.fromEntries(next.checkin.selectedTaskIds.map((taskId) => [taskId, true]));
      setPicked(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được báo cáo sáng");
      setData(null);
      setPicked({});
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const pickedCount = useMemo(() => Object.values(picked).filter(Boolean).length, [picked]);

  async function submit() {
    if (!data) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const taskIds = Object.keys(picked).filter((taskId) => picked[taskId]);
      const method = data.checkin.exists ? "PATCH" : "POST";
      const response = await fetch(`/api/reports/morning/${projectId}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Không lưu được báo cáo sáng");
      }

      setMessage(data.checkin.exists ? "Đã cập nhật danh sách check-in" : "Đã gửi báo cáo sáng");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được báo cáo sáng");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {data?.checkin.exists ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <div className="font-semibold">✅ Đã gửi báo cáo sáng</div>
          <div className="mt-1 text-xs">{formatSubmitStatus(data.checkin)}</div>
          <div className="mt-1 text-xs">{data.checkin.selectedTaskIds.length} task được chọn</div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#2f3555] bg-[#171c2f] p-3 text-sm text-[#d9def3]">
          Tick các task hôm nay anh sẽ làm:
        </div>
      )}

      {GROUP_ORDER.map((groupKey) => {
        const rows = data?.groups[groupKey] || [];
        if (rows.length === 0) return null;

        return (
          <div key={groupKey} className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-[1px] text-[#98a0c2]">{GROUP_LABELS[groupKey]} ({rows.length})</div>
            <div className="space-y-2">
              {rows.map((row) => (
                <label key={row.taskId} className="flex items-start justify-between gap-3 rounded-xl border border-[#293251] bg-[#0f1424] px-3 py-2.5 text-sm text-[#f0f2ff]">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(picked[row.taskId])}
                      onChange={(event) => setPicked((prev) => ({ ...prev, [row.taskId]: event.target.checked }))}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-semibold">{row.taskCode} - {row.taskName}</div>
                      {taskHint(row) ? <div className="text-xs text-[#98a0c2]">{taskHint(row)}</div> : null}
                    </div>
                  </div>
                  <a href={`/tasks/${row.taskId}?tab=technical&subtab=today`} className="text-xs font-semibold text-[#f97316]">
                    Vào task
                  </a>
                </label>
              ))}
            </div>
          </div>
        );
      })}

      <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="text-sm text-[#d9def3]">Đã chọn: <b className="text-[#f97316]">{pickedCount}</b> task</div>
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="mt-3 rounded-xl bg-[#f97316] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Đang lưu..." : data?.checkin.exists ? "💾 Cập nhật danh sách" : "📤 Gửi báo cáo sáng"}
        </button>
      </div>

      {loading ? <div className="text-sm text-[#98a0c2]">Đang tải dữ liệu sáng...</div> : null}
      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div> : null}
    </div>
  );
}
