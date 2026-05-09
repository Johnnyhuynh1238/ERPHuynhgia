"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TaskPhotoUploadStatus, useTaskPhotoUploader } from "../../tasks/[id]/_components/task-photo-tools";

type AssignmentStatus = "pending" | "done" | "not_applicable";
type AssignmentType = "template_item" | "progress_update" | "tptc_assignment";
type AssignmentPriority = "normal" | "important" | "urgent" | "critical";

type FlatAssignment = {
  id: string;
  type: AssignmentType;
  title: string;
  status: AssignmentStatus;
  priority: AssignmentPriority;
  requirePhoto: boolean;
  guideContent: string | null;
  photoUrl: string | null;
  note: string | null;
  dueAt: string | null;
  doneAt: string | null;
  taskId?: string | null;
  taskCode?: string | null;
  taskName?: string | null;
  projectId: string | null;
  projectName: string | null;
  currentProgress?: number;
};

type TaskGroup = {
  taskId: string;
  taskCode: string | null;
  taskName: string | null;
  projectName: string | null;
  assignments: FlatAssignment[];
};

type ProjectGroup = {
  projectId: string;
  projectName: string | null;
  assignments: FlatAssignment[];
};

type TodayResponse = {
  date: string;
  submissionDeadline: string;
  currentTime: string;
  submitted: boolean;
  mode: "flat" | "task" | "project";
  submission: { id: string; submittedAt: string; isLate: boolean } | null;
  stats: { total: number; done: number; notApplicable: number; pending: number };
  assignments: FlatAssignment[];
  taskGroups: TaskGroup[];
  projectGroups: ProjectGroup[];
};

type CheckinTask = {
  id: string;
  code: string;
  name: string;
  status: string;
  progressPercent: number;
  group: "in_progress" | "overdue" | "starting_today" | "upcoming" | "other";
};

type CheckinProject = {
  projectId: string;
  projectName: string;
  tasks: CheckinTask[];
};

type CheckinTptcItem = {
  id: string;
  title: string;
  priority: AssignmentPriority;
  dueAt: string;
  status: string;
  assignedAt: string;
  assignedBy: string;
};

type CheckinTptcProject = {
  projectId: string;
  projectName: string;
  assignments: CheckinTptcItem[];
};

type CheckinResponse = {
  reportDate: string;
  taskProjects: CheckinProject[];
  tptcProjects: CheckinTptcProject[];
};

const GROUP_LABEL: Record<CheckinTask["group"], string> = {
  in_progress: "Đang làm",
  overdue: "Quá hạn",
  starting_today: "Bắt đầu hôm nay",
  upcoming: "Sắp tới",
  other: "Khác",
};

const PRIORITY_LABEL: Record<AssignmentPriority, string> = {
  normal: "Thường",
  important: "Quan trọng",
  urgent: "Khẩn",
  critical: "Cực khẩn",
};

const PRIORITY_HEADERS: Array<{ priority: AssignmentPriority; label: string; className: string }> = [
  { priority: "critical", label: "🔴 CỰC KHẨN", className: "bg-red-500/10 text-red-300" },
  { priority: "urgent", label: "🟧 KHẨN", className: "bg-orange-500/10 text-orange-300" },
  { priority: "important", label: "🟦 QUAN TRỌNG", className: "bg-blue-500/10 text-blue-300" },
  { priority: "normal", label: "⚪ THƯỜNG", className: "bg-[#1a1a1a] text-[#98a0c2]" },
];

function classForPriority(priority: AssignmentPriority) {
  switch (priority) {
    case "critical":
      return "text-red-300";
    case "urgent":
      return "text-orange-300";
    case "important":
      return "text-blue-300";
    default:
      return "text-slate-200";
  }
}

function formatClock(iso: string | null) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

function remainLabel(deadlineIso: string, nowIso: string) {
  const diffMs = new Date(deadlineIso).getTime() - new Date(nowIso).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes <= 0) return "Đã quá hạn nộp báo cáo";
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  return `Còn ${hours}h${String(mins).padStart(2, "0")} đến hạn 18:00`;
}


export function ReportsHubClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"flat" | "task" | "project">("flat");
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [checkin, setCheckin] = useState<CheckinResponse | null>(null);
  const [pickedTaskIds, setPickedTaskIds] = useState<Record<string, boolean>>({});
  const [pickedTptcIds, setPickedTptcIds] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [checkinTaskPickerOpen, setCheckinTaskPickerOpen] = useState(false);
  const [checkinPickerStep, setCheckinPickerStep] = useState<"projects" | "tasks">("projects");
  const [checkinPickerProjectId, setCheckinPickerProjectId] = useState<string | null>(null);
  const [checkinPickerTaskIds, setCheckinPickerTaskIds] = useState<Record<string, boolean>>({});
  const [doneModalItem, setDoneModalItem] = useState<FlatAssignment | null>(null);
  const [donePhotoUrl, setDonePhotoUrl] = useState("");
  const [doneNote, setDoneNote] = useState("");
  const [notApplicableItem, setNotApplicableItem] = useState<FlatAssignment | null>(null);
  const [progressModalItem, setProgressModalItem] = useState<FlatAssignment | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressPhotoUrl, setProgressPhotoUrl] = useState("");
  const [progressReason, setProgressReason] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [guideItem, setGuideItem] = useState<FlatAssignment | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const { items: progressUploadItems, upload: uploadProgressPhotos, clear: clearProgressUploads } = useTaskPhotoUploader(progressModalItem?.taskId || "");

  const totalPicked = useMemo(() => {
    const taskCount = Object.values(pickedTaskIds).filter(Boolean).length;
    const tptcCount = Object.values(pickedTptcIds).filter(Boolean).length;
    return taskCount + tptcCount;
  }, [pickedTaskIds, pickedTptcIds]);

  const needCheckin = useMemo(() => {
    if (!today) return false;
    return !today.submitted && today.stats.total === 0;
  }, [today]);

  const taskModeGroups = useMemo(() => {
    if (!today) return [];
    if (!selectedProjectId) return today.taskGroups;
    return today.taskGroups.filter((group) => group.assignments.some((item) => item.projectId === selectedProjectId));
  }, [today, selectedProjectId]);

  const taskModeTptcItems = useMemo(() => {
    if (!today) return [] as FlatAssignment[];
    const rows = today.assignments.filter((item) => item.type === "tptc_assignment");
    if (!selectedProjectId) return rows;
    return rows.filter((item) => item.projectId === selectedProjectId);
  }, [today, selectedProjectId]);

  const checkinInProgressProjects = useMemo(
    () =>
      (checkin?.taskProjects || [])
        .map((project) => ({
          ...project,
          tasks: project.tasks.filter((task) => task.group === "in_progress"),
        }))
        .filter((project) => project.tasks.length > 0),
    [checkin],
  );

  const checkinSelectedExtraProjects = useMemo(
    () =>
      (checkin?.taskProjects || [])
        .map((project) => ({
          ...project,
          tasks: project.tasks.filter((task) => task.group !== "in_progress" && pickedTaskIds[task.id]),
        }))
        .filter((project) => project.tasks.length > 0),
    [checkin, pickedTaskIds],
  );

  const checkinPickerProject = useMemo(() => {
    const projects = checkin?.taskProjects || [];
    return projects.find((project) => project.projectId === checkinPickerProjectId) || null;
  }, [checkin, checkinPickerProjectId]);

  const checkinPickerSelectedCount = useMemo(() => Object.values(checkinPickerTaskIds).filter(Boolean).length, [checkinPickerTaskIds]);

  const flatPriorityGroups = useMemo(() => {
    if (!today) {
      return {
        pendingByPriority: {
          critical: [] as FlatAssignment[],
          urgent: [] as FlatAssignment[],
          important: [] as FlatAssignment[],
          normal: [] as FlatAssignment[],
        },
        doneOrNa: [] as FlatAssignment[],
      };
    }

    const pendingByPriority: Record<AssignmentPriority, FlatAssignment[]> = {
      critical: [],
      urgent: [],
      important: [],
      normal: [],
    };

    const doneOrNa: FlatAssignment[] = [];

    for (const item of today.assignments) {
      if (item.status === "pending") {
        pendingByPriority[item.priority || "normal"].push(item);
      } else {
        doneOrNa.push(item);
      }
    }

    return { pendingByPriority, doneOrNa };
  }, [today]);

  const loadToday = useCallback(async (nextMode: "flat" | "task" | "project") => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/today?mode=${nextMode}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Không tải được nhiệm vụ hôm nay");
      }
      setToday(json as TodayResponse);
      setMode(nextMode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được nhiệm vụ hôm nay");
      setToday(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCheckinOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/reports/today/checkin-options", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Không tải được dữ liệu check-in");
      }
      setCheckin(json as CheckinResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu check-in");
      setCheckin(null);
    }
  }, []);

  useEffect(() => {
    loadToday("flat");
  }, [loadToday]);

  useEffect(() => {
    if (needCheckin) {
      loadCheckinOptions();
    }
  }, [needCheckin, loadCheckinOptions]);

  useEffect(() => {
    if ((!checkinTaskPickerOpen && !progressModalItem) || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [checkinTaskPickerOpen, progressModalItem]);

  async function postAction(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof json?.message === "string" ? json.message : "Thao tác thất bại");
    }
  }

  function openCheckinTaskPicker() {
    setCheckinPickerStep("projects");
    setCheckinPickerProjectId(null);
    setCheckinPickerTaskIds(pickedTaskIds);
    setCheckinTaskPickerOpen(true);
  }

  function closeCheckinTaskPicker() {
    setCheckinTaskPickerOpen(false);
    setCheckinPickerStep("projects");
    setCheckinPickerProjectId(null);
    setCheckinPickerTaskIds({});
  }

  function selectCheckinPickerProject(projectId: string) {
    setCheckinPickerProjectId(projectId);
    setCheckinPickerStep("tasks");
  }

  function backToCheckinPickerProjects() {
    setCheckinPickerStep("projects");
    setCheckinPickerProjectId(null);
  }

  function addCheckinPickerTasks() {
    setPickedTaskIds(checkinPickerTaskIds);
    closeCheckinTaskPicker();
  }

  async function submitCheckin() {
    const taskIds = Object.keys(pickedTaskIds).filter((id) => pickedTaskIds[id]);
    const tptcAssignmentIds = Object.keys(pickedTptcIds).filter((id) => pickedTptcIds[id]);
    if (!taskIds.length && !tptcAssignmentIds.length) {
      setError("Bạn chưa chọn công việc nào.");
      return;
    }

    setBusyId("checkin");
    try {
      await postAction("/api/reports/today/checkin", { taskIds, tptcAssignmentIds });
      await loadToday("flat");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-in thất bại");
    } finally {
      setBusyId(null);
    }
  }

  function openDoneModal(item: FlatAssignment) {
    setDoneModalItem(item);
    setDonePhotoUrl(item.photoUrl || "");
    setDoneNote(item.note || "");
  }

  async function confirmDone() {
    if (!doneModalItem) return;
    if (doneModalItem.requirePhoto && !donePhotoUrl.trim()) {
      setError("Nhiệm vụ này bắt buộc có ảnh minh chứng");
      return;
    }

    setBusyId(doneModalItem.id);
    try {
      await postAction(`/api/reports/assignments/${doneModalItem.id}/done`, {
        photoUrl: donePhotoUrl.trim() || undefined,
        note: doneNote.trim() || undefined,
      });
      setDoneModalItem(null);
      setDonePhotoUrl("");
      setDoneNote("");
      await loadToday(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đánh dấu hoàn thành");
    } finally {
      setBusyId(null);
    }
  }

  function openNotApplicableModal(item: FlatAssignment) {
    setNotApplicableItem(item);
  }

  async function confirmNotApplicable() {
    if (!notApplicableItem) return;

    setBusyId(notApplicableItem.id);
    try {
      await postAction(`/api/reports/assignments/${notApplicableItem.id}/not-applicable`, {});
      setNotApplicableItem(null);
      await loadToday(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đánh dấu không áp dụng");
    } finally {
      setBusyId(null);
    }
  }

  async function resetItem(item: FlatAssignment) {
    setBusyId(item.id);
    try {
      await postAction(`/api/reports/assignments/${item.id}/reset`, {});
      await loadToday(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể bỏ đánh dấu");
    } finally {
      setBusyId(null);
    }
  }

  function openProgressModal(item: FlatAssignment) {
    clearProgressUploads();
    setProgressModalItem(item);
    setProgressPercent(item.currentProgress || 0);
    setProgressPhotoUrl(item.photoUrl || "");
    setProgressReason("");
    setProgressNote(item.note || "");
  }

  async function uploadProgressPhotoFiles(files: FileList | null) {
    if (!progressModalItem?.taskId || !files?.length) return;

    const result = await uploadProgressPhotos(Array.from(files).slice(0, 1));
    const uploadedPhoto = result.uploaded[0];
    if (uploadedPhoto?.photoUrl) {
      setProgressPhotoUrl(uploadedPhoto.photoUrl);
    }
    if (result.failed[0]?.message) {
      setError(result.failed[0].message);
    }
  }

  async function confirmProgressUpdate() {
    if (!progressModalItem) return;
    const currentProgress = progressModalItem.currentProgress || 0;

    if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
      setError("Tiến độ phải nằm trong khoảng 0-100");
      return;
    }

    if (!progressPhotoUrl.trim()) {
      setError("Cập nhật tiến độ bắt buộc có ảnh minh chứng");
      return;
    }

    if (progressPercent < currentProgress && !progressReason.trim()) {
      setError("Khi giảm tiến độ cần nhập lý do");
      return;
    }

    setBusyId(progressModalItem.id);
    try {
      await postAction(`/api/reports/assignments/${progressModalItem.id}/update-progress`, {
        newPercent: progressPercent,
        photoUrl: progressPhotoUrl.trim(),
        reason: progressReason.trim() || undefined,
        note: progressNote.trim() || undefined,
      });
      setProgressModalItem(null);
      clearProgressUploads();
      await loadToday(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể cập nhật tiến độ");
    } finally {
      setBusyId(null);
    }
  }

  function openSubmitConfirm() {
    setSubmitConfirmOpen(true);
  }

  async function submitDayReport() {
    setBusyId("submit");
    try {
      await postAction("/api/reports/submit", {});
      setSubmitConfirmOpen(false);
      await loadToday(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được báo cáo");
    } finally {
      setBusyId(null);
    }
  }

  function openGuide(item: FlatAssignment) {
    if (!item.guideContent) return;
    setGuideItem(item);
  }

  function handleAssignmentStatusClick(item: FlatAssignment) {
    if (item.status === "pending") {
      if (item.type === "progress_update") {
        openProgressModal(item);
      } else {
        openDoneModal(item);
      }
      return;
    }

    void resetItem(item);
  }

  function renderAssignmentItem(item: FlatAssignment) {
    const isDone = item.status === "done";
    const isNa = item.status === "not_applicable";
    const isPending = item.status === "pending";

    return (
      <div
        key={item.id}
        className={`rounded-2xl border border-[#2f3555] border-l-4 border-l-[#555] bg-[#171c2f] p-4 shadow-sm ${
          isDone ? "border-l-emerald-500 opacity-80" : isNa ? "border-l-[#777] opacity-70" : ""
        } ${item.type === "tptc_assignment" ? "border-l-orange-400" : ""} ${item.type === "progress_update" ? "border-l-blue-500 bg-[#0a1a2a]" : ""}`}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            disabled={busyId === item.id}
            onClick={() => handleAssignmentStatusClick(item)}
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-sm font-bold disabled:opacity-60 ${
              isDone ? "border-emerald-500 bg-emerald-500 text-white" : isNa ? "border-[#666] bg-[#666] text-white" : "border-[#555]"
            }`}
            aria-label={isPending ? (item.type === "progress_update" ? "Cập nhật tiến độ" : "Đánh dấu hoàn thành") : "Bỏ đánh dấu"}
          >
            {isDone ? "✓" : isNa ? "⊘" : ""}
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold leading-6 text-[#f0f2ff]">{item.title}</div>
            <div className="mt-1.5 text-xs leading-5 text-[#98a0c2]">
              {item.taskCode ? `${item.taskCode} · ` : ""}
              {item.projectName || "Không rõ dự án"}
              {item.dueAt ? ` · Hạn ${formatDateTime(item.dueAt)}` : ""}
              {!isPending && item.doneAt ? ` · ${formatClock(item.doneAt)}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.requirePhoto ? <span className="rounded-md bg-orange-500/15 px-2 py-1 text-[11px] font-semibold text-orange-300">📷 Yêu cầu ảnh</span> : null}
              {item.type === "tptc_assignment" ? <span className="rounded-md bg-orange-500/15 px-2 py-1 text-[11px] font-semibold text-orange-300">⚡ TPTC giao</span> : null}
            </div>
          </div>
        </div>

        {item.type === "progress_update" && isPending ? (
          <button
            type="button"
            disabled={busyId === item.id}
            onClick={() => openProgressModal(item)}
            className="mt-3 w-full rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 px-3 py-2.5 text-sm font-semibold text-white"
          >
            {busyId === item.id ? "Đang cập nhật..." : "📊 Cập nhật ngay →"}
          </button>
        ) : null}

        {item.type !== "progress_update" && isPending ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => openDoneModal(item)}
              className="flex-1 rounded-lg border border-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-300"
            >
              ✅ Hoàn thành
            </button>
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => openNotApplicableModal(item)}
              className="flex-1 rounded-lg border border-[#666] px-3 py-2 text-sm font-semibold text-[#b6b9c9]"
            >
              ⊘ N/A
            </button>
            {item.guideContent ? (
              <button
                type="button"
                onClick={() => openGuide(item)}
                className="flex-1 rounded-lg border border-orange-400 px-3 py-2 text-sm font-semibold text-orange-300"
              >
                📖 Hướng dẫn
              </button>
            ) : null}
          </div>
        ) : null}

        {!isPending ? (
          <button
            type="button"
            disabled={busyId === item.id}
            onClick={() => resetItem(item)}
            className="mt-3 rounded-lg border border-[#2f3555] px-3 py-2 text-xs font-semibold text-[#c2c9e4]"
          >
            Bỏ đánh dấu
          </button>
        ) : null}
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm text-[#98a0c2]">Đang tải dữ liệu báo cáo...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>;
  }

  if (!today) {
    return <div className="rounded-xl border border-[#2f3555] bg-[#171c2f] p-4 text-sm text-[#98a0c2]">Không có dữ liệu báo cáo.</div>;
  }

  if (needCheckin) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
          <div className="text-lg font-bold text-[#f0f2ff]">☀️ Check-in sáng</div>
          <div className="mt-1 text-xs text-[#98a0c2]">Ngày {checkin?.reportDate ? new Date(checkin.reportDate).toLocaleDateString("vi-VN") : "--/--/----"}</div>
          <div className="mt-2 text-sm text-[#d9def3]">Đã chọn: {totalPicked} việc hôm nay</div>
        </div>

        <section className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#f0f2ff]">Task đang làm</div>
              <div className="mt-1 text-xs text-[#98a0c2]">Chỉ hiện sẵn các task đang làm. Task khác chọn trong popup thêm task.</div>
            </div>
            <button
              type="button"
              onClick={openCheckinTaskPicker}
              className="shrink-0 rounded-lg border border-[#f97316]/30 bg-[#f97316]/10 px-3 py-1.5 text-xs font-bold text-[#f97316]"
            >
              + Thêm task
            </button>
          </div>

          {checkinInProgressProjects.length > 0 ? (
            <div className="mt-3 space-y-3">
              {checkinInProgressProjects.map((project) => (
                <div key={project.projectId} className="rounded-xl border border-[#2f3555] bg-[#11182d] p-3">
                  <div className="text-xs font-semibold text-[#98a0c2]">{project.projectName}</div>
                  <div className="mt-2 space-y-1.5">
                    {project.tasks.map((task) => (
                      <label key={task.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#2f3555] px-2 py-2 text-sm text-[#d9def3]">
                        <input
                          type="checkbox"
                          checked={Boolean(pickedTaskIds[task.id])}
                          onChange={(e) => setPickedTaskIds((prev) => ({ ...prev, [task.id]: e.target.checked }))}
                        />
                        <span>
                          {task.code} · {task.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-[#2f3555] p-3 text-xs text-[#98a0c2]">
              Chưa có task nào đang làm. Bấm thêm task để chọn việc hôm nay.
            </div>
          )}

          {checkinSelectedExtraProjects.length > 0 ? (
            <div className="mt-4 border-t border-[#2f3555] pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#98a0c2]">Task đã chọn thêm</div>
              <div className="mt-2 space-y-3">
                {checkinSelectedExtraProjects.map((project) => (
                  <div key={project.projectId} className="rounded-xl border border-[#2f3555] bg-[#0f1424] p-3">
                    <div className="text-xs font-semibold text-[#98a0c2]">{project.projectName}</div>
                    <div className="mt-2 space-y-1.5">
                      {project.tasks.map((task) => (
                        <label key={task.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#2f3555] px-2 py-2 text-sm text-[#d9def3]">
                          <input
                            type="checkbox"
                            checked={Boolean(pickedTaskIds[task.id])}
                            onChange={(e) => setPickedTaskIds((prev) => ({ ...prev, [task.id]: e.target.checked }))}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="block">{task.code} · {task.name}</span>
                            <span className="text-xs text-[#98a0c2]">{GROUP_LABEL[task.group]}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {checkinTaskPickerOpen && typeof document !== "undefined"
          ? createPortal(
              <div className="modal-backdrop-in fixed inset-0 z-[100] flex items-end justify-center overflow-hidden bg-black/65 p-3 sm:items-center">
                <div className="modal-sheet-in flex max-h-[calc(100dvh-24px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#2f3555] bg-[#171c2f] shadow-2xl sm:max-h-[92dvh] sm:rounded-2xl">
                  <div className="shrink-0 border-b border-[#2f3555] p-4">
                    {checkinPickerStep === "tasks" ? (
                      <button
                        type="button"
                        onClick={backToCheckinPickerProjects}
                        className="mb-3 inline-flex items-center rounded-lg border border-[#2f3555] px-2.5 py-1 text-xs font-semibold text-[#d9def3]"
                      >
                        ← Đổi dự án
                      </button>
                    ) : null}
                    <div className="text-base font-bold text-[#f0f2ff]">
                      {checkinPickerStep === "projects" ? "Chọn dự án" : checkinPickerProject?.projectName || "Chọn task"}
                    </div>
                    <div className="mt-1 text-xs text-[#98a0c2]">
                      {checkinPickerStep === "projects" ? "Bấm vào dự án để xem task được phân quyền." : "Tick task cần thêm rồi bấm nút Thêm bên dưới."}
                    </div>
                  </div>

                  <div key={`${checkinPickerStep}-${checkinPickerProjectId || "projects"}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                    {checkinPickerStep === "projects" ? (
                      <div className="space-y-2">
                        {(checkin?.taskProjects || []).length > 0 ? (
                          (checkin?.taskProjects || []).map((project) => {
                            const selectedCount = project.tasks.filter((task) => checkinPickerTaskIds[task.id]).length;
                            const inProgressCount = project.tasks.filter((task) => task.group === "in_progress").length;

                            return (
                              <button
                                key={project.projectId}
                                type="button"
                                onClick={() => selectCheckinPickerProject(project.projectId)}
                                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#2f3555] bg-[#0f1424] px-3 py-3 text-left"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-[#f0f2ff]">{project.projectName}</span>
                                  <span className="mt-0.5 block text-xs text-[#98a0c2]">
                                    {project.tasks.length} task · {inProgressCount} đang làm
                                  </span>
                                </span>
                                <span className="shrink-0 rounded-full bg-[#1f2740] px-2 py-1 text-xs font-semibold text-[#f97316]">
                                  {selectedCount > 0 ? `${selectedCount} đã chọn` : "Chọn"}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="rounded-xl border border-dashed border-[#2f3555] p-4 text-sm text-[#98a0c2]">Không có dự án/task được phân quyền.</div>
                        )}
                      </div>
                    ) : checkinPickerProject ? (
                      <div className="space-y-2">
                        {checkinPickerProject.tasks.length > 0 ? (
                          checkinPickerProject.tasks.map((task) => (
                            <label key={task.id} className="flex cursor-pointer items-start gap-2 rounded-xl border border-[#2f3555] bg-[#0f1424] px-3 py-2.5 text-sm text-[#f0f2ff]">
                              <input
                                type="checkbox"
                                checked={Boolean(checkinPickerTaskIds[task.id])}
                                onChange={(event) => setCheckinPickerTaskIds((prev) => ({ ...prev, [task.id]: event.target.checked }))}
                                className="mt-0.5"
                              />
                              <span className="min-w-0">
                                <span className="block font-semibold">{task.code} · {task.name}</span>
                                <span className="text-xs text-[#98a0c2]">{GROUP_LABEL[task.group]} · Tiến độ {task.progressPercent}%</span>
                              </span>
                            </label>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-[#2f3555] p-4 text-sm text-[#98a0c2]">Dự án này chưa có task để chọn.</div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-[#2f3555] p-4 text-sm text-[#98a0c2]">Vui lòng quay lại chọn dự án.</div>
                    )}
                  </div>

                  <div className="flex shrink-0 justify-end gap-2 border-t border-[#2f3555] bg-[#171c2f] p-4">
                    <button
                      type="button"
                      onClick={closeCheckinTaskPicker}
                      className="rounded-lg border border-[#2f3555] px-3 py-2 text-xs font-semibold text-[#d9def3]"
                    >
                      Hủy
                    </button>
                    {checkinPickerStep === "tasks" ? (
                      <button
                        type="button"
                        disabled={!checkinPickerProject || checkinPickerSelectedCount === 0}
                        onClick={addCheckinPickerTasks}
                        className="rounded-lg border border-[#f97316]/30 bg-[#f97316]/10 px-4 py-2 text-xs font-bold text-[#f97316] disabled:opacity-50"
                      >
                        Thêm ({checkinPickerSelectedCount})
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}

        {(checkin?.tptcProjects || []).length > 0 ? (
          <section className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="text-sm font-semibold text-[#f0f2ff]">⚡ Việc TPTC giao hôm nay</div>
            <div className="mt-2 space-y-2">
              {checkin?.tptcProjects.map((project) => (
                <div key={project.projectId} className="rounded-lg border border-[#2f3555] p-3">
                  <div className="text-xs text-[#98a0c2]">{project.projectName}</div>
                  <div className="mt-2 space-y-1.5">
                    {project.assignments.map((item) => (
                      <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded border border-[#2f3555] px-2 py-1.5 text-sm text-[#d9def3]">
                        <input
                          type="checkbox"
                          checked={Boolean(pickedTptcIds[item.id])}
                          onChange={(e) => setPickedTptcIds((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                        />
                        <span>
                          <span className="block">{item.title}</span>
                          <span className="text-xs text-[#98a0c2]">
                            {PRIORITY_LABEL[item.priority]} · Hạn {formatDateTime(item.dueAt)} · {item.assignedBy}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <button
          type="button"
          disabled={busyId === "checkin" || totalPicked === 0}
          onClick={submitCheckin}
          className="rounded-lg border border-[#f97316]/30 bg-[#f97316]/10 px-3 py-2 text-sm font-bold text-[#f97316] disabled:opacity-60"
        >
          {busyId === "checkin" ? "Đang gửi check-in..." : "📤 Gửi check-in"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[#2f3555] border-l-4 border-l-[#ff8a3d] bg-[#171c2f] p-5 shadow-sm">
        <div className="text-2xl font-black tracking-tight text-[#f0f2ff]">📋 Nhiệm vụ hôm nay</div>
        <div className="mt-1.5 text-sm text-[#98a0c2]">{new Date(today.date).toLocaleDateString("vi-VN")}</div>
        <div className="mt-3 inline-block rounded-lg bg-[#2a1a05] px-3 py-1.5 text-sm font-semibold text-[#ff8a3d]">
          ⏰ {remainLabel(today.submissionDeadline, today.currentTime)}
        </div>
        {today.submitted ? (
          <div className="mt-3 text-sm font-semibold text-emerald-300">
            Đã gửi lúc {formatClock(today.submission?.submittedAt || null)}
            {today.submission?.isLate ? " · Trễ" : " · Đúng giờ"}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] px-3 py-3 text-center shadow-sm">
          <div className="text-2xl font-black text-[#d9def3]">{today.stats.total}</div>
          <div className="mt-0.5 text-xs font-semibold text-[#8f95ad]">Tổng</div>
        </div>
        <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] px-3 py-3 text-center shadow-sm">
          <div className="text-2xl font-black text-emerald-300">{today.stats.done}</div>
          <div className="mt-0.5 text-xs font-semibold text-[#8f95ad]">✅ Xong</div>
        </div>
        <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] px-3 py-3 text-center shadow-sm">
          <div className="text-2xl font-black text-[#d9def3]">{today.stats.notApplicable}</div>
          <div className="mt-0.5 text-xs font-semibold text-[#8f95ad]">⊘ N/A</div>
        </div>
        <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] px-3 py-3 text-center shadow-sm">
          <div className="text-2xl font-black text-[#ff8a3d]">{today.stats.pending}</div>
          <div className="mt-0.5 text-xs font-semibold text-[#8f95ad]">☐ Còn</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[#2f3555] bg-[#171c2f] p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId(null);
            loadToday("flat");
          }}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${mode === "flat" ? "bg-[#f97316] text-white" : "border border-[#2f3555] text-[#d9def3]"}`}
        >
          ☰ Phẳng
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId(null);
            loadToday("task");
          }}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${mode === "task" ? "bg-[#f97316] text-white" : "border border-[#2f3555] text-[#d9def3]"}`}
        >
          📋 Task
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId(null);
            loadToday("project");
          }}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${mode === "project" ? "bg-[#f97316] text-white" : "border border-[#2f3555] text-[#d9def3]"}`}
        >
          🏠 Dự án
        </button>
      </div>

      {mode === "flat" ? (
        <section className="space-y-3 rounded-xl bg-transparent p-0">
          {PRIORITY_HEADERS.map((header) => {
            const rows = flatPriorityGroups.pendingByPriority[header.priority];
            if (!rows.length) return null;

            return (
              <div key={header.priority}>
                <div className={`mb-2 inline-block rounded px-2 py-1 text-xs font-bold ${header.className}`}>{header.label}</div>
                <div className="space-y-2">{rows.map((item) => renderAssignmentItem(item))}</div>
              </div>
            );
          })}

          {flatPriorityGroups.doneOrNa.length > 0 ? (
            <div>
              <div className="mb-2 inline-block rounded bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-300">
                ✅ ĐÃ XONG ({flatPriorityGroups.doneOrNa.length})
              </div>
              <div className="space-y-2">{flatPriorityGroups.doneOrNa.map((item) => renderAssignmentItem(item))}</div>
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === "task" ? (
        <div className="space-y-3">
          {selectedProjectId ? (
            <div className="flex items-center justify-between rounded-lg border border-[#2f3555] bg-[#171c2f] px-3 py-2 text-xs text-[#d9def3]">
              <span>Đang lọc theo dự án đã chọn</span>
              <button
                type="button"
                onClick={() => setSelectedProjectId(null)}
                className="rounded border border-[#2f3555] px-2 py-1 text-[11px] text-[#98a0c2]"
              >
                Bỏ lọc
              </button>
            </div>
          ) : null}

          {taskModeGroups.map((group) => {
            const doneCount = group.assignments.filter((item) => item.status !== "pending").length;
            return (
              <div key={group.taskId} className="rounded-2xl border border-[#2f3555] border-l-4 border-l-[#ff8a3d] bg-[#171c2f] p-4 shadow-sm">
                <div className="border-b border-[#2a2a2a] pb-3">
                  <div className="text-base font-bold leading-6 text-[#ff8a3d]">
                    {group.taskCode ? `${group.taskCode} ` : ""}
                    {group.taskName || "Task"}
                  </div>
                  <div className="mt-1.5 text-xs leading-5 text-[#98a0c2]">
                    {group.projectName || "Không rõ dự án"} · {doneCount}/{group.assignments.length} nhiệm vụ xong
                  </div>
                </div>
                <div className="mt-3 space-y-3">{group.assignments.map((item) => renderAssignmentItem(item))}</div>
              </div>
            );
          })}

          {taskModeTptcItems.length > 0 ? (
            <div className="rounded-2xl border border-[#2f3555] border-l-4 border-l-orange-400 bg-[#171c2f] p-4 shadow-sm">
              <div className="border-b border-[#2a2a2a] pb-3">
                <div className="text-base font-bold text-orange-300">⚡ Việc TPTC giao</div>
                <div className="mt-1.5 text-xs leading-5 text-[#98a0c2]">
                  {taskModeTptcItems.filter((item) => item.status !== "pending").length}/{taskModeTptcItems.length} xong
                </div>
              </div>
              <div className="mt-3 space-y-3">{taskModeTptcItems.map((item) => renderAssignmentItem(item))}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "project" ? (
        <div className="space-y-3">
          {today.projectGroups.map((group) => {
            const doneCount = group.assignments.filter((item) => item.status !== "pending").length;
            return (
              <div key={group.projectId} className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4 shadow-sm">
                <div className="text-base font-bold leading-6 text-[#f0f2ff]">🏠 {group.projectName || "Không rõ dự án"}</div>
                <div className="mt-1.5 text-sm text-[#98a0c2]">{doneCount}/{group.assignments.length} đã tick</div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProjectId(group.projectId === "unknown" ? null : group.projectId);
                    loadToday("task");
                  }}
                  className="mt-3 rounded-lg border border-[#2f3555] bg-[#11182d] px-3 py-2 text-sm font-semibold text-[#d9def3]"
                >
                  Chi tiết →
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {!today.submitted ? (
        <div
          className={`rounded-2xl border-2 border-dashed p-5 text-center shadow-sm ${
            today.stats.pending > 0 ? "border-[#444] bg-[#171c2f]" : "border-emerald-500 bg-gradient-to-br from-[#0a2a0a] to-[#171c2f]"
          }`}
        >
          <div className={`mb-3 text-base ${today.stats.pending > 0 ? "text-[#8f95ad]" : "font-semibold text-emerald-300"}`}>
            {today.stats.pending > 0 ? `⚠ Còn ${today.stats.pending} nhiệm vụ chưa tick` : "✅ Đã tick đủ tất cả nhiệm vụ"}
          </div>
          <button
            type="button"
            disabled={today.stats.pending > 0 || busyId === "submit"}
            onClick={openSubmitConfirm}
            className="w-full rounded-xl bg-[#ff8a3d] px-4 py-3 text-base font-bold text-black disabled:cursor-not-allowed disabled:bg-[#333] disabled:text-[#666]"
          >
            {busyId === "submit" ? "Đang gửi..." : "📤 Gửi báo cáo cuối ngày"}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-emerald-500 bg-[#0a2a0a]/40 p-5 shadow-sm">
          <div className="text-base font-bold text-emerald-300">🎉 ĐÃ GỬI BÁO CÁO HÔM NAY</div>
          <div className="mt-2 text-sm leading-6 text-[#d9def3]">
            <span className="font-semibold text-emerald-300">Thời gian:</span> {formatClock(today.submission?.submittedAt || null)}
            {today.submission?.isLate ? " (trễ)" : " (đúng giờ ✓)"}
          </div>
          <div className="mt-2 text-sm leading-6 text-[#d9def3]">
            ✅ {today.stats.done} nhiệm vụ hoàn thành
            <br />⊘ {today.stats.notApplicable} nhiệm vụ không áp dụng
          </div>
        </div>
      )}

      {doneModalItem ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3">
          <div className="w-full max-w-md rounded-xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="text-sm font-semibold text-[#f0f2ff]">✅ Đánh dấu hoàn thành</div>
            <div className="mt-1 text-xs text-[#98a0c2]">{doneModalItem.title}</div>
            <div className="mt-3 space-y-2">
              <input
                value={donePhotoUrl}
                onChange={(e) => setDonePhotoUrl(e.target.value)}
                placeholder={doneModalItem.requirePhoto ? "Link ảnh minh chứng (bắt buộc)" : "Link ảnh minh chứng (tuỳ chọn)"}
                className="w-full rounded-md border border-[#2f3555] bg-[#11182d] px-2 py-1.5 text-sm text-[#d9def3]"
              />
              <textarea
                value={doneNote}
                onChange={(e) => setDoneNote(e.target.value)}
                placeholder="Ghi chú (tuỳ chọn)"
                rows={3}
                className="w-full rounded-md border border-[#2f3555] bg-[#11182d] px-2 py-1.5 text-sm text-[#d9def3]"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDoneModalItem(null)} className="rounded border border-[#2f3555] px-3 py-1.5 text-xs text-[#d9def3]">
                Hủy
              </button>
              <button
                type="button"
                disabled={busyId === doneModalItem.id}
                onClick={confirmDone}
                className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
              >
                {busyId === doneModalItem.id ? "Đang xử lý..." : "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notApplicableItem ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3">
          <div className="w-full max-w-md rounded-xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="text-sm font-semibold text-[#f0f2ff]">⊘ Đánh dấu không áp dụng</div>
            <div className="mt-2 text-sm text-[#d9def3]">Xác nhận đánh dấu &quot;{notApplicableItem.title}&quot; là không áp dụng?</div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setNotApplicableItem(null)} className="rounded border border-[#2f3555] px-3 py-1.5 text-xs text-[#d9def3]">
                Hủy
              </button>
              <button
                type="button"
                disabled={busyId === notApplicableItem.id}
                onClick={confirmNotApplicable}
                className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
              >
                {busyId === notApplicableItem.id ? "Đang xử lý..." : "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {progressModalItem && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop-in fixed inset-0 z-[100] flex items-end justify-center overflow-hidden bg-black/65 p-3 sm:items-center">
              <div className="modal-sheet-in flex max-h-[calc(100dvh-24px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[#2f3555] bg-[#171c2f] shadow-2xl sm:max-h-[92dvh] sm:rounded-2xl">
                <div className="shrink-0 border-b border-[#2f3555] p-4">
                  <div className="text-lg font-bold text-[#f0f2ff]">📈 Cập nhật tiến độ</div>
                  <div className="mt-1 text-sm text-[#98a0c2]">{progressModalItem.title}</div>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
                  <div className="rounded-2xl border border-[#2f3555] bg-[#11182d] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[#d9def3]">Tiến độ mới</div>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={progressPercent}
                        onChange={(e) => setProgressPercent(Number(e.target.value))}
                        className="w-20 rounded-lg border border-[#2f3555] bg-[#171c2f] px-2 py-1.5 text-center text-sm font-bold text-[#f0f2ff]"
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={progressPercent}
                      onChange={(e) => setProgressPercent(Number(e.target.value))}
                      className="mt-4 w-full accent-[#f97316]"
                    />
                    <div className="mt-2 flex justify-between text-[11px] text-[#98a0c2]">
                      <span>0%</span>
                      <span className="font-semibold text-[#f97316]">{progressPercent}%</span>
                      <span>100%</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#2f3555] bg-[#11182d] p-4">
                    <div className="text-sm font-semibold text-[#d9def3]">Ảnh minh chứng</div>
                    <div className="mt-1 text-xs text-[#98a0c2]">Chọn ảnh từ điện thoại, hệ thống sẽ upload vào task rồi gắn vào cập nhật tiến độ.</div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (event) => {
                        await uploadProgressPhotoFiles(event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                      className="mt-3 w-full rounded-lg border border-[#2f3555] bg-[#171c2f] px-3 py-2 text-sm text-[#d9def3] file:mr-3 file:rounded-md file:border-0 file:bg-[#f97316] file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-black"
                    />
                    {progressUploadItems.length > 0 ? <TaskPhotoUploadStatus items={progressUploadItems} onClear={clearProgressUploads} /> : null}
                    {progressPhotoUrl ? (
                      <a href={progressPhotoUrl} target="_blank" rel="noreferrer" className="mt-3 block rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 underline">
                        Đã có ảnh minh chứng, bấm để xem ảnh
                      </a>
                    ) : null}
                  </div>

                  <input
                    value={progressReason}
                    onChange={(e) => setProgressReason(e.target.value)}
                    placeholder="Lý do (bắt buộc khi giảm tiến độ)"
                    className="w-full rounded-xl border border-[#2f3555] bg-[#11182d] px-3 py-2.5 text-sm text-[#d9def3]"
                  />
                  <textarea
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                    placeholder="Ghi chú (tuỳ chọn)"
                    rows={3}
                    className="w-full rounded-xl border border-[#2f3555] bg-[#11182d] px-3 py-2.5 text-sm text-[#d9def3]"
                  />
                </div>

                <div className="flex shrink-0 justify-end gap-2 border-t border-[#2f3555] bg-[#171c2f] p-4">
                  <button
                    type="button"
                    onClick={() => {
                      setProgressModalItem(null);
                      clearProgressUploads();
                    }}
                    className="rounded-lg border border-[#2f3555] px-3 py-2 text-xs font-semibold text-[#d9def3]"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={busyId === progressModalItem.id}
                    onClick={confirmProgressUpdate}
                    className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-bold text-blue-200 disabled:opacity-50"
                  >
                    {busyId === progressModalItem.id ? "Đang cập nhật..." : "Cập nhật"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {guideItem ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3">
          <div className="w-full max-w-2xl rounded-xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="text-sm font-semibold text-[#f0f2ff]">📖 {guideItem.title}</div>
            <div className="mt-3 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm text-[#d9def3]">{guideItem.guideContent}</div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setGuideItem(null)} className="rounded border border-[#2f3555] px-3 py-1.5 text-xs text-[#d9def3]">
                Đóng
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {submitConfirmOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3">
          <div className="w-full max-w-md rounded-xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="text-sm font-semibold text-[#f0f2ff]">📤 Gửi báo cáo cuối ngày</div>
            <div className="mt-2 text-sm text-[#d9def3]">Xác nhận gửi báo cáo hôm nay?</div>
            <div className="mt-2 text-xs text-[#98a0c2]">
              ✅ {today.stats.done} · ⊘ {today.stats.notApplicable} · ☐ {today.stats.pending}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSubmitConfirmOpen(false)} className="rounded border border-[#2f3555] px-3 py-1.5 text-xs text-[#d9def3]">
                Hủy
              </button>
              <button
                type="button"
                disabled={busyId === "submit"}
                onClick={submitDayReport}
                className="rounded border border-[#f97316]/30 bg-[#f97316]/10 px-3 py-1.5 text-xs font-semibold text-[#f97316]"
              >
                {busyId === "submit" ? "Đang gửi..." : "Xác nhận gửi"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
