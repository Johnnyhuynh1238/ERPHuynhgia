"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type TaskPhotoItem, TaskPhotoUploadStatus, useTaskPhotoUploader } from "../../tasks/[id]/_components/task-photo-tools";

type AssignmentStatus = "pending" | "done" | "not_applicable";
type AssignmentType =
  | "template_item"
  | "progress_update"
  | "tptc_assignment"
  | "qc_checklist"
  | "worker_attendance_morning"
  | "worker_attendance_afternoon";
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
  tptcAssignmentId?: string | null;
  tptcStatus?: string | null;
  tptcDescription?: string | null;
  tptcAssignerName?: string | null;
  tptcReviewNote?: string | null;
  tptcAcknowledgedAt?: string | null;
  tptcDailyStatus?: "working_on_today" | "not_today" | null;
  tptcDailyNote?: string | null;
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
  hasCheckedIn: boolean;
  defaultRest: { isSunday: boolean; message: string } | null;
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
  { priority: "normal", label: "⚪ THƯỜNG", className: "bg-[#1a1a1a] text-[#8892b0]" },
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

function formatDueWithCountdown(iso: string) {
  const due = new Date(iso);
  const now = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  const ddmm = `${String(due.getDate()).padStart(2, "0")}/${String(due.getMonth() + 1).padStart(2, "0")}`;
  const hhmm = `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`;
  let suffix = "";
  if (diffDays === 0) suffix = " (HÔM NAY)";
  else if (diffDays === 1) suffix = " (ngày mai)";
  else if (diffDays > 1) suffix = ` (còn ${diffDays} ngày)`;
  else suffix = ` (TRỄ ${Math.abs(diffDays)} ngày)`;
  return `${ddmm} ${hhmm}${suffix}`;
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
  const [supplementMode, setSupplementMode] = useState(false);
  const [doneModalItem, setDoneModalItem] = useState<FlatAssignment | null>(null);
  const [donePhotoUrl, setDonePhotoUrl] = useState("");
  const [doneNote, setDoneNote] = useState("");
  const [notApplicableItem, setNotApplicableItem] = useState<FlatAssignment | null>(null);
  const [actionItem, setActionItem] = useState<FlatAssignment | null>(null);
  const [tptcActionItem, setTptcActionItem] = useState<FlatAssignment | null>(null);
  const [notTodayItem, setNotTodayItem] = useState<FlatAssignment | null>(null);
  const [notTodayNote, setNotTodayNote] = useState("");
  const [ackTptcItem, setAckTptcItem] = useState<FlatAssignment | null>(null);
  const ackedDeepLinkRef = useRef<string | null>(null);
  const [progressModalItem, setProgressModalItem] = useState<FlatAssignment | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressPhotos, setProgressPhotos] = useState<TaskPhotoItem[]>([]);
  const [progressReason, setProgressReason] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [guideItem, setGuideItem] = useState<FlatAssignment | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const removedProgressUploadIdsRef = useRef(new Set<string>());
  const { items: progressUploadItems, upload: uploadProgressPhotos, clear: clearProgressUploads, remove: removeProgressUploadItem } = useTaskPhotoUploader(progressModalItem?.taskId || "");
  const { items: doneUploadItems, upload: uploadDonePhotos, clear: clearDoneUploads } = useTaskPhotoUploader(doneModalItem?.taskId || "");

  const totalPicked = useMemo(() => {
    const taskCount = Object.values(pickedTaskIds).filter(Boolean).length;
    const tptcCount = Object.values(pickedTptcIds).filter(Boolean).length;
    return taskCount + tptcCount;
  }, [pickedTaskIds, pickedTptcIds]);

  const needCheckin = useMemo(() => {
    if (!today) return false;
    if (today.submitted) return false;
    return !today.hasCheckedIn || supplementMode;
  }, [today, supplementMode]);

  const alreadyCheckedTaskIds = useMemo(() => {
    if (!today) return new Set<string>();
    const ids = new Set<string>();
    for (const item of today.assignments) {
      if (item.taskId) ids.add(item.taskId);
    }
    return ids;
  }, [today]);

  const alreadyCheckedTptcIds = useMemo(() => {
    if (!today) return new Set<string>();
    const ids = new Set<string>();
    for (const item of today.assignments) {
      if (item.type === "tptc_assignment" && item.tptcAssignmentId) ids.add(item.tptcAssignmentId);
    }
    return ids;
  }, [today]);

  const displayCheckin = useMemo(() => {
    if (!checkin) return null;
    if (!supplementMode) return checkin;
    return {
      ...checkin,
      taskProjects: checkin.taskProjects
        .map((project) => ({
          ...project,
          tasks: project.tasks.filter((task) => !alreadyCheckedTaskIds.has(task.id)),
        }))
        .filter((project) => project.tasks.length > 0),
      tptcProjects: checkin.tptcProjects
        .map((project) => ({
          ...project,
          assignments: project.assignments.filter((item) => !alreadyCheckedTptcIds.has(item.id)),
        }))
        .filter((project) => project.assignments.length > 0),
    };
  }, [checkin, supplementMode, alreadyCheckedTaskIds, alreadyCheckedTptcIds]);

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
      (displayCheckin?.taskProjects || [])
        .map((project) => ({
          ...project,
          tasks: project.tasks.filter((task) => task.group === "in_progress"),
        }))
        .filter((project) => project.tasks.length > 0),
    [displayCheckin],
  );

  const checkinSelectedExtraProjects = useMemo(
    () =>
      (displayCheckin?.taskProjects || [])
        .map((project) => ({
          ...project,
          tasks: project.tasks.filter((task) => task.group !== "in_progress" && pickedTaskIds[task.id]),
        }))
        .filter((project) => project.tasks.length > 0),
    [displayCheckin, pickedTaskIds],
  );

  const checkinPickerProject = useMemo(() => {
    const projects = displayCheckin?.taskProjects || [];
    return projects.find((project) => project.projectId === checkinPickerProjectId) || null;
  }, [displayCheckin, checkinPickerProjectId]);

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
    if (!today || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ackTptcId = params.get("ackTptc");
    if (!ackTptcId || ackedDeepLinkRef.current === ackTptcId) return;

    const target = today.assignments.find(
      (item) => item.type === "tptc_assignment" && item.tptcAssignmentId === ackTptcId,
    );
    if (!target) return;

    ackedDeepLinkRef.current = ackTptcId;
    if (target.tptcAcknowledgedAt) {
      setTptcActionItem(target);
    } else {
      setAckTptcItem(target);
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("ackTptc");
    window.history.replaceState({}, "", url.toString());
  }, [today]);

  useEffect(() => {
    const hasOpenModal = Boolean(checkinTaskPickerOpen || doneModalItem || notApplicableItem || actionItem || tptcActionItem || notTodayItem || ackTptcItem || progressModalItem || guideItem || submitConfirmOpen);
    if (!hasOpenModal || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [actionItem, tptcActionItem, notTodayItem, ackTptcItem, checkinTaskPickerOpen, doneModalItem, guideItem, notApplicableItem, progressModalItem, submitConfirmOpen]);

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
      const wasSupplement = supplementMode;
      setPickedTaskIds({});
      setPickedTptcIds({});
      setSupplementMode(false);
      await loadToday(wasSupplement ? mode : "flat");
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
    clearDoneUploads();
  }

  const [donePhotoBusy, setDonePhotoBusy] = useState(false);

  async function uploadDonePhotoFile(files: FileList | null) {
    const arr = Array.from(files || []).filter(Boolean);
    if (!arr.length || !doneModalItem) return;

    if (doneModalItem.taskId) {
      try {
        const { uploaded, failed } = await uploadDonePhotos([arr[0]]);
        if (failed.length) {
          setError(failed[0].message || "Upload ảnh thất bại");
          return;
        }
        const url = uploaded[0]?.photoUrl;
        if (url) setDonePhotoUrl(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload ảnh thất bại");
      }
      return;
    }

    setDonePhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", arr[0]);
      if (arr[0].lastModified > 0) {
        fd.append("originalLastModified", String(arr[0].lastModified));
      }
      const res = await fetch(`/api/reports/assignments/${doneModalItem.id}/photo`, {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.message || `Upload thất bại (${res.status})`);
        return;
      }
      if (body?.photoUrl) setDonePhotoUrl(body.photoUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload ảnh thất bại");
    } finally {
      setDonePhotoBusy(false);
    }
  }

  async function confirmDone() {
    if (!doneModalItem) return;
    if (doneModalItem.requirePhoto && !donePhotoUrl.trim()) {
      setError("Nhiệm vụ này bắt buộc có ảnh minh chứng");
      return;
    }
    if (doneModalItem.type === "tptc_assignment" && !doneNote.trim()) {
      setError("Vui lòng nhập báo cáo cho TPTC");
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
      clearDoneUploads();
      await loadToday(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đánh dấu hoàn thành");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmAck() {
    if (!ackTptcItem || !ackTptcItem.tptcAssignmentId) return;
    setBusyId(ackTptcItem.id);
    try {
      await postAction(`/api/tptc-assignments/${ackTptcItem.tptcAssignmentId}/acknowledge`, {});
      setAckTptcItem(null);
      await loadToday(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể xác nhận nhận việc");
    } finally {
      setBusyId(null);
    }
  }

  async function markWorkingOnToday(item: FlatAssignment) {
    if (!item.tptcAssignmentId) return;
    setBusyId(item.id);
    try {
      await postAction(`/api/tptc-assignments/${item.tptcAssignmentId}/daily-status`, {
        status: "working_on_today",
      });
      setTptcActionItem(null);
      await loadToday(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể cập nhật trạng thái hôm nay");
    } finally {
      setBusyId(null);
    }
  }

  function openNotTodayModal(item: FlatAssignment) {
    setNotTodayItem(item);
    setNotTodayNote(item.tptcDailyNote || "");
    setTptcActionItem(null);
  }

  async function confirmNotToday() {
    if (!notTodayItem || !notTodayItem.tptcAssignmentId) return;
    const note = notTodayNote.trim();
    if (!note) {
      setError("Vui lòng nhập lý do chưa làm hôm nay");
      return;
    }
    setBusyId(notTodayItem.id);
    try {
      await postAction(`/api/tptc-assignments/${notTodayItem.tptcAssignmentId}/daily-status`, {
        status: "not_today",
        note,
      });
      setNotTodayItem(null);
      setNotTodayNote("");
      await loadToday(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể cập nhật trạng thái hôm nay");
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
    removedProgressUploadIdsRef.current = new Set();
    setProgressModalItem(item);
    setProgressPercent(item.currentProgress || 0);
    setProgressPhotos(item.photoUrl ? [{ photoUrl: item.photoUrl, thumbnailUrl: item.photoUrl }] : []);
    setProgressReason("");
    setProgressNote(item.note || "");
  }

  async function uploadProgressPhotoFiles(files: FileList | null) {
    if (!progressModalItem?.taskId || !files?.length) return;

    const result = await uploadProgressPhotos(Array.from(files));
    const photosToAttach = result.uploadedItems
      .filter((item) => !removedProgressUploadIdsRef.current.has(item.itemId))
      .map((item) => item.photo);

    if (photosToAttach.length) {
      setProgressPhotos((current) => {
        const byUrl = new Map(current.map((photo) => [photo.photoUrl, photo]));
        for (const photo of photosToAttach) {
          byUrl.set(photo.photoUrl, photo);
        }
        return Array.from(byUrl.values());
      });
    }
    if (result.failed[0]?.message) {
      setError(result.failed[0].message);
    }
  }

  function removeProgressPhoto(photoUrl: string) {
    setProgressPhotos((current) => current.filter((photo) => photo.photoUrl !== photoUrl));
  }

  async function confirmProgressUpdate() {
    if (!progressModalItem) return;
    const currentProgress = progressModalItem.currentProgress || 0;

    if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
      setError("Tiến độ phải nằm trong khoảng 0-100");
      return;
    }

    const progressPhotoUrls = progressPhotos.map((photo) => photo.photoUrl).filter(Boolean);

    if (!progressPhotoUrls.length) {
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
        photoUrl: progressPhotoUrls[0],
        photoUrls: progressPhotoUrls,
        reason: progressReason.trim() || undefined,
        note: progressNote.trim() || undefined,
      });
      setProgressModalItem(null);
      setProgressPhotos([]);
      removedProgressUploadIdsRef.current = new Set();
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

  function renderAssignmentItem(item: FlatAssignment) {
    const isDone = item.status === "done";
    const isNa = item.status === "not_applicable";
    const isQc = item.type === "qc_checklist";
    const displayTitle = item.type === "progress_update" && item.taskName ? `Cập nhật tiến độ · ${item.taskName}` : item.title;
    const metaLine = `${item.taskCode ? `${item.taskCode} · ` : ""}${item.projectName || "Không rõ dự án"}`;

    if (item.type === "worker_attendance_morning" || item.type === "worker_attendance_afternoon") {
      const sessionParam = item.type === "worker_attendance_afternoon" ? "afternoon" : "morning";
      const sessionLabel = sessionParam === "afternoon" ? "Chấm công chiều" : "Chấm công sáng";
      return (
        <a
          key={item.id}
          href={`/cham-cong-tho/${item.projectId}?session=${sessionParam}`}
          className={`block w-full rounded-2xl border p-4 text-left transition active:scale-[0.97] ${
            isDone
              ? "border-emerald-500/30 bg-emerald-500/10 opacity-80"
              : "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className={`text-[10px] font-bold uppercase tracking-wide ${isDone ? "text-emerald-300" : "text-amber-300"}`}>
                {sessionLabel} · Thợ
              </div>
              <div className="mt-1 text-sm font-bold leading-5 text-[#f0f2ff]">{displayTitle}</div>
              <div className="mt-1 text-xs leading-5 text-[#8892b0]">{metaLine}</div>
            </div>
            <div className={`shrink-0 text-xs font-semibold ${isDone ? "text-emerald-300" : "text-amber-300"}`}>
              {isDone ? "Đã chấm ✓" : "Mở →"}
            </div>
          </div>
        </a>
      );
    }

    if (isQc && item.taskId) {
      return (
        <a
          key={item.id}
          href={`/tasks/${item.taskId}?tab=qc&sub=checklist`}
          className={`block w-full rounded-2xl border p-4 text-left transition active:scale-[0.97] ${
            isDone
              ? "border-emerald-500/30 bg-emerald-500/10 opacity-80"
              : "border-red-500/40 bg-red-500/10 hover:bg-red-500/20"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wide text-red-300">QC CHECKLIST · Task 100%</div>
              <div className="mt-1 text-sm font-bold leading-5 text-[#f0f2ff]">{displayTitle}</div>
              <div className="mt-1 text-xs leading-5 text-[#8892b0]">{metaLine}</div>
            </div>
            <div className="shrink-0 text-xs font-semibold text-red-300">Mở →</div>
          </div>
        </a>
      );
    }

    function handleCardClick() {
      if (item.status !== "pending") {
        void resetItem(item);
        return;
      }
      if (item.type === "progress_update") {
        openProgressModal(item);
        return;
      }
      if (item.type === "tptc_assignment") {
        if (!item.tptcAcknowledgedAt) {
          setAckTptcItem(item);
        } else {
          setTptcActionItem(item);
        }
        return;
      }
      setActionItem(item);
    }

    const isTptc = item.type === "tptc_assignment";
    const isNewTptc = isTptc && !item.tptcAcknowledgedAt && item.status === "pending";

    return (
      <button
        key={item.id}
        type="button"
        disabled={busyId === item.id}
        onClick={handleCardClick}
        className={`block w-full rounded-2xl border p-4 text-left transition hover:bg-[#1f2436] active:scale-[0.97] disabled:opacity-60 ${
          isTptc ? "border-orange-500/40 bg-orange-500/5" : "border-[#252840] bg-[#1a1d2e]"
        } ${isDone ? "opacity-80" : isNa ? "opacity-70" : ""} ${item.type === "progress_update" ? "bg-[#13151f]" : ""}`}
      >
        {isTptc ? (
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-300">
              ⚡ TPTC giao
            </span>
            {isNewTptc ? (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                📥 MỚI
              </span>
            ) : null}
            {item.tptcDailyStatus === "working_on_today" ? (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                ✓ Đang làm hôm nay
              </span>
            ) : item.tptcDailyStatus === "not_today" ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                ⏸ Chưa làm hôm nay
              </span>
            ) : item.status === "pending" && item.tptcAcknowledgedAt ? (
              <span className="rounded bg-zinc-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300">
                ⚠ Chưa cập nhật trạng thái
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="text-sm font-bold leading-5 text-[#f0f2ff]">{displayTitle}</div>
        <div className="mt-1 text-xs leading-5 text-[#8892b0]">{metaLine}</div>
      </button>
    );
  }

  if (loading) {
    return <div className="text-sm text-[#8892b0]">Đang tải dữ liệu báo cáo...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>;
  }

  if (!today) {
    return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">Không có dữ liệu báo cáo.</div>;
  }

  if (needCheckin) {
    return (
      <div className="space-y-4">
        {today?.defaultRest?.isSunday ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-[13px] text-amber-200">
            <div className="text-sm font-semibold text-amber-200">🏖️ Chủ Nhật — công trường nghỉ mặc định</div>
            <div className="mt-1 text-xs text-amber-100/80">{today.defaultRest.message}</div>
          </div>
        ) : null}
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-[#f0f2ff]">
                {supplementMode ? "➕ Bổ sung công tác" : "☀️ Check-in sáng"}
              </div>
              <div className="mt-1 text-xs text-[#8892b0]">Ngày {displayCheckin?.reportDate ? new Date(displayCheckin.reportDate).toLocaleDateString("vi-VN") : "--/--/----"}</div>
            </div>
            {supplementMode ? (
              <button
                type="button"
                onClick={() => {
                  setSupplementMode(false);
                  setPickedTaskIds({});
                  setPickedTptcIds({});
                }}
                className="shrink-0 rounded-[10px] border border-[#252840] px-3 py-2 text-xs font-semibold text-[#8892b0]"
              >
                ← Thoát
              </button>
            ) : null}
          </div>
          {supplementMode ? (
            <div className="mt-2 rounded-[10px] border border-dashed border-[#f97316]/30 bg-[#f97316]/5 px-3 py-2 text-xs text-[#ff8a3d]">
              Chỉ hiện task/việc TPTC <b>chưa</b> chọn sáng. Tick các công tác còn thiếu rồi bấm Gửi.
            </div>
          ) : null}
          <div className="mt-2 text-sm text-[#f0f2ff]">Đã chọn: {totalPicked} việc {supplementMode ? "bổ sung" : "hôm nay"}</div>
        </div>

        <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#f0f2ff]">Task đang làm</div>
              <div className="mt-1 text-xs text-[#8892b0]">Chỉ hiện sẵn các task đang làm. Task khác chọn trong popup thêm task.</div>
            </div>
            <button
              type="button"
              onClick={openCheckinTaskPicker}
              className="shrink-0 rounded-[10px] border border-[#f97316]/30 bg-[#f97316]/10 px-[14px] py-[10px] text-[13px] font-bold text-[#f97316] transition active:scale-[0.97]"
            >
              + Thêm task
            </button>
          </div>

          {checkinInProgressProjects.length > 0 ? (
            <div className="mt-3 space-y-3">
              {checkinInProgressProjects.map((project) => (
                <div key={project.projectId} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
                  <div className="text-sm font-bold text-[#f0f2ff]">{project.projectName}</div>
                  <div className="mt-2 space-y-1.5">
                    {project.tasks.map((task) => (
                      <label key={task.id} className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#2d3249] bg-[#13151f] px-[14px] py-[10px] text-[13px] font-semibold text-[#f0f2ff] transition active:scale-[0.97]">
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
            <div className="mt-3 rounded-2xl border border-dashed border-[#252840] p-3 text-xs text-[#8892b0]">
              Chưa có task nào đang làm. Bấm thêm task để chọn việc hôm nay.
            </div>
          )}

          {checkinSelectedExtraProjects.length > 0 ? (
            <div className="mt-4 border-t border-[#252840] pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#8892b0]">Task đã chọn thêm</div>
              <div className="mt-2 space-y-3">
                {checkinSelectedExtraProjects.map((project) => (
                  <div key={project.projectId} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
                    <div className="text-sm font-bold text-[#f0f2ff]">{project.projectName}</div>
                    <div className="mt-2 space-y-1.5">
                      {project.tasks.map((task) => (
                        <label key={task.id} className="flex cursor-pointer items-start gap-2 rounded-[10px] border border-[#2d3249] bg-[#13151f] px-[14px] py-[10px] text-[13px] font-semibold text-[#f0f2ff] transition active:scale-[0.97]">
                          <input
                            type="checkbox"
                            checked={Boolean(pickedTaskIds[task.id])}
                            onChange={(e) => setPickedTaskIds((prev) => ({ ...prev, [task.id]: e.target.checked }))}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="block">{task.code} · {task.name}</span>
                            <span className="text-xs text-[#8892b0]">{GROUP_LABEL[task.group]}</span>
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
                <div className="modal-sheet-in flex max-h-[calc(100dvh-24px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#252840] bg-[#1a1d2e] shadow-2xl sm:max-h-[92dvh] sm:rounded-2xl">
                  <div className="shrink-0 border-b border-[#252840] p-4">
                    {checkinPickerStep === "tasks" ? (
                      <button
                        type="button"
                        onClick={backToCheckinPickerProjects}
                        className="mb-3 inline-flex items-center rounded-lg border border-[#252840] px-2.5 py-1 text-xs font-semibold text-[#f0f2ff]"
                      >
                        ← Đổi dự án
                      </button>
                    ) : null}
                    <div className="text-base font-bold text-[#f0f2ff]">
                      {checkinPickerStep === "projects" ? "Chọn dự án" : checkinPickerProject?.projectName || "Chọn task"}
                    </div>
                    <div className="mt-1 text-xs text-[#8892b0]">
                      {checkinPickerStep === "projects" ? "Bấm vào dự án để xem task được phân quyền." : "Tick task cần thêm rồi bấm nút Thêm bên dưới."}
                    </div>
                  </div>

                  <div key={`${checkinPickerStep}-${checkinPickerProjectId || "projects"}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                    {checkinPickerStep === "projects" ? (
                      <div className="space-y-2">
                        {(displayCheckin?.taskProjects || []).length > 0 ? (
                          (displayCheckin?.taskProjects || []).map((project) => {
                            const selectedCount = project.tasks.filter((task) => checkinPickerTaskIds[task.id]).length;
                            const inProgressCount = project.tasks.filter((task) => task.group === "in_progress").length;

                            return (
                              <button
                                key={project.projectId}
                                type="button"
                                onClick={() => selectCheckinPickerProject(project.projectId)}
                                className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-[#2d3249] bg-[#13151f] px-[14px] py-[10px] text-left transition hover:bg-[#1f2436] active:scale-[0.97]"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-[#f0f2ff]">{project.projectName}</span>
                                  <span className="mt-0.5 block text-xs text-[#8892b0]">
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
                          <div className="rounded-2xl border border-dashed border-[#252840] p-4 text-sm text-[#8892b0]">Không có dự án/task được phân quyền.</div>
                        )}
                      </div>
                    ) : checkinPickerProject ? (
                      <div className="space-y-2">
                        {checkinPickerProject.tasks.length > 0 ? (
                          checkinPickerProject.tasks.map((task) => (
                            <label key={task.id} className="flex cursor-pointer items-start gap-2 rounded-[10px] border border-[#2d3249] bg-[#13151f] px-[14px] py-[10px] text-[13px] font-semibold text-[#f0f2ff] transition active:scale-[0.97]">
                              <input
                                type="checkbox"
                                checked={Boolean(checkinPickerTaskIds[task.id])}
                                onChange={(event) => setCheckinPickerTaskIds((prev) => ({ ...prev, [task.id]: event.target.checked }))}
                                className="mt-0.5"
                              />
                              <span className="min-w-0">
                                <span className="block font-semibold">{task.code} · {task.name}</span>
                                <span className="text-xs text-[#8892b0]">{GROUP_LABEL[task.group]} · Tiến độ {task.progressPercent}%</span>
                              </span>
                            </label>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-[#252840] p-4 text-sm text-[#8892b0]">Dự án này chưa có task để chọn.</div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[#252840] p-4 text-sm text-[#8892b0]">Vui lòng quay lại chọn dự án.</div>
                    )}
                  </div>

                  <div className="flex shrink-0 justify-end gap-2 border-t border-[#252840] bg-[#1a1d2e] p-4">
                    <button
                      type="button"
                      onClick={closeCheckinTaskPicker}
                      className="rounded-lg border border-[#252840] px-3 py-2 text-xs font-semibold text-[#f0f2ff]"
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

        {(displayCheckin?.tptcProjects || []).length > 0 ? (
          <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <div className="text-sm font-semibold text-[#f0f2ff]">⚡ Việc TPTC giao hôm nay</div>
            <div className="mt-2 space-y-2">
              {displayCheckin?.tptcProjects.map((project) => (
                <div key={project.projectId} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
                  <div className="text-sm font-bold text-[#f0f2ff]">{project.projectName}</div>
                  <div className="mt-2 space-y-1.5">
                    {project.assignments.map((item) => (
                      <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-[10px] border border-[#2d3249] bg-[#13151f] px-[14px] py-[10px] text-[13px] font-semibold text-[#f0f2ff] transition active:scale-[0.97]">
                        <input
                          type="checkbox"
                          checked={Boolean(pickedTptcIds[item.id])}
                          onChange={(e) => setPickedTptcIds((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                        />
                        <span>
                          <span className="block">{item.title}</span>
                          <span className="text-xs text-[#8892b0]">
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
          className="flex w-full items-center justify-between rounded-[10px] border border-[#f97316]/30 bg-[#f97316]/10 px-[14px] py-[10px] text-[13px] font-bold text-[#f97316] transition active:scale-[0.97] disabled:opacity-60"
        >
          {busyId === "checkin"
            ? supplementMode
              ? "Đang bổ sung..."
              : "Đang gửi check-in..."
            : supplementMode
              ? "📤 Gửi bổ sung"
              : "📤 Gửi check-in"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {today.defaultRest?.isSunday ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-[13px] text-amber-200">
          <div className="text-sm font-semibold text-amber-200">🏖️ Chủ Nhật — công trường nghỉ mặc định</div>
          <div className="mt-1 text-xs text-amber-100/80">{today.defaultRest.message}</div>
        </div>
      ) : null}
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-xl font-bold text-[#f0f2ff]">📋 Nhiệm vụ hôm nay</div>
        <div className="mt-1 text-xs text-[#8892b0]">{new Date(today.date).toLocaleDateString("vi-VN")}</div>
        {today.submitted ? (
          <div className="mt-2 inline-block rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300">
            ✅ Đã nộp lúc {formatClock(today.submission?.submittedAt || null)}
            {today.submission?.isLate ? " · Trễ" : " · Đúng giờ"}
          </div>
        ) : (
          <div className="mt-2 inline-block rounded-full bg-[#2a1a05] px-2 py-1 text-[11px] font-medium text-[#ff8a3d]">
            ⏰ {remainLabel(today.submissionDeadline, today.currentTime)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] px-2 py-2 text-center">
          <div className="text-lg font-bold text-[#f0f2ff]">{today.stats.total}</div>
          <div className="text-[11px] text-[#8892b0]">Tổng</div>
        </div>
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] px-2 py-2 text-center">
          <div className="text-lg font-bold text-emerald-300">{today.stats.done}</div>
          <div className="text-[11px] text-[#8892b0]">✅ Xong</div>
        </div>
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] px-2 py-2 text-center">
          <div className="text-lg font-bold text-[#f0f2ff]">{today.stats.notApplicable}</div>
          <div className="text-[11px] text-[#8892b0]">⊘ N/A</div>
        </div>
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] px-2 py-2 text-center">
          <div className="text-lg font-bold text-[#ff8a3d]">{today.stats.pending}</div>
          <div className="text-[11px] text-[#8892b0]">☐ Còn</div>
        </div>
      </div>

      {!today.submitted && today.hasCheckedIn ? (
        <button
          type="button"
          onClick={() => {
            setPickedTaskIds({});
            setPickedTptcIds({});
            setError(null);
            setSupplementMode(true);
          }}
          className="flex w-full items-center justify-between rounded-[10px] border border-dashed border-[#f97316]/40 bg-[#f97316]/5 px-[14px] py-[10px] text-[13px] font-semibold text-[#f97316] transition active:scale-[0.97]"
        >
          <span>➕ Bổ sung công tác đã check-in</span>
          <span className="text-[11px] font-normal text-[#8892b0]">Quên tick task?</span>
        </button>
      ) : null}

      <div className="sticky top-14 z-20 grid grid-cols-3 gap-1.5 rounded-2xl border border-[#252840] bg-[#1a1d2e] p-1 md:top-[64px]">
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId(null);
            loadToday("flat");
          }}
          className={`rounded-[10px] px-[14px] py-[10px] text-[13px] font-semibold transition active:scale-[0.97] ${mode === "flat" ? "bg-[#f97316] text-black" : "border border-[#2d3249] bg-[#13151f] text-[#8892b0]"}`}
        >
          ☰ Phẳng
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId(null);
            loadToday("task");
          }}
          className={`rounded-[10px] px-[14px] py-[10px] text-[13px] font-semibold transition active:scale-[0.97] ${mode === "task" ? "bg-[#f97316] text-black" : "border border-[#2d3249] bg-[#13151f] text-[#8892b0]"}`}
        >
          📋 Task
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedProjectId(null);
            loadToday("project");
          }}
          className={`rounded-[10px] px-[14px] py-[10px] text-[13px] font-semibold transition active:scale-[0.97] ${mode === "project" ? "bg-[#f97316] text-black" : "border border-[#2d3249] bg-[#13151f] text-[#8892b0]"}`}
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
            <div className="flex items-center justify-between rounded-lg border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-xs text-[#f0f2ff]">
              <span>Đang lọc theo dự án đã chọn</span>
              <button
                type="button"
                onClick={() => setSelectedProjectId(null)}
                className="rounded border border-[#252840] px-2 py-1 text-[11px] text-[#8892b0]"
              >
                Bỏ lọc
              </button>
            </div>
          ) : null}

          {taskModeGroups.map((group) => {
            const doneCount = group.assignments.filter((item) => item.status !== "pending").length;
            return (
              <div key={group.taskId} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
                <div className="mb-2 border-b border-[#252840] pb-2">
                  <div className="text-sm font-bold leading-5 text-[#f0f2ff]">
                    {group.taskCode ? `${group.taskCode} ` : ""}
                    {group.taskName || "Task"}
                  </div>
                  <div className="mt-1 text-xs text-[#8892b0]">
                    {group.projectName || "Không rõ dự án"} · {doneCount}/{group.assignments.length} nhiệm vụ xong
                  </div>
                </div>
                <div className="space-y-2">{group.assignments.map((item) => renderAssignmentItem(item))}</div>
              </div>
            );
          })}

          {taskModeTptcItems.length > 0 ? (
            <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
              <div className="mb-2 border-b border-[#252840] pb-2">
                <div className="text-sm font-bold text-[#f0f2ff]">⚡ Việc TPTC giao</div>
                <div className="mt-1 text-xs text-[#8892b0]">
                  {taskModeTptcItems.filter((item) => item.status !== "pending").length}/{taskModeTptcItems.length} xong
                </div>
              </div>
              <div className="space-y-2">{taskModeTptcItems.map((item) => renderAssignmentItem(item))}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "project" ? (
        <div className="space-y-3">
          {today.projectGroups.map((group) => {
            const doneCount = group.assignments.filter((item) => item.status !== "pending").length;
            return (
              <div key={group.projectId} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
                <div className="text-sm font-bold leading-5 text-[#f0f2ff]">🏠 {group.projectName || "Không rõ dự án"}</div>
                <div className="mt-1 text-xs text-[#8892b0]">{doneCount}/{group.assignments.length} đã tick</div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProjectId(group.projectId === "unknown" ? null : group.projectId);
                    loadToday("task");
                  }}
                  className="mt-3 flex w-full items-center justify-between rounded-[10px] border border-[#2d3249] bg-[#13151f] px-[14px] py-[10px] text-[13px] font-semibold text-[#8892b0] transition hover:bg-[#1f2436] active:scale-[0.97]"
                >
                  <span>Chi tiết</span>
                  <span>›</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {!today.submitted ? (
        <div
          className={`rounded-2xl border p-4 text-center ${
            today.stats.pending > 0 ? "border-[#252840] bg-[#1a1d2e]" : "border-emerald-500/40 bg-emerald-500/10"
          }`}
        >
          <div className={`mb-3 text-sm ${today.stats.pending > 0 ? "text-[#8892b0]" : "font-semibold text-emerald-300"}`}>
            {today.stats.pending > 0 ? `⚠ Còn ${today.stats.pending} nhiệm vụ chưa tick` : "✅ Đã tick đủ tất cả nhiệm vụ"}
          </div>
          <button
            type="button"
            disabled={today.stats.pending > 0 || busyId === "submit"}
            onClick={openSubmitConfirm}
            className="flex w-full items-center justify-between rounded-[10px] bg-[#ff8a3d] px-[14px] py-[10px] text-[13px] font-bold text-black transition active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-[#333] disabled:text-[#666]"
          >
            <span>{busyId === "submit" ? "Đang gửi..." : "📤 Gửi báo cáo cuối ngày"}</span>
            <span>›</span>
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <div className="text-sm font-bold text-emerald-300">🎉 ĐÃ GỬI BÁO CÁO HÔM NAY</div>
          <div className="mt-2 text-xs leading-5 text-[#f0f2ff]">
            <span className="font-semibold text-emerald-300">Thời gian:</span> {formatClock(today.submission?.submittedAt || null)}
            {today.submission?.isLate ? " (trễ)" : " (đúng giờ ✓)"}
          </div>
          <div className="mt-2 text-xs leading-5 text-[#f0f2ff]">
            ✅ {today.stats.done} nhiệm vụ hoàn thành
            <br />⊘ {today.stats.notApplicable} nhiệm vụ không áp dụng
          </div>
        </div>
      )}

      {actionItem && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop-in fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3">
              <div className="modal-panel-in w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 shadow-2xl">
                <div className="text-base font-bold text-[#f0f2ff]">{actionItem.title}</div>
                <div className="mt-1 text-xs text-[#8892b0]">
                  {actionItem.taskCode ? `${actionItem.taskCode} · ` : ""}
                  {actionItem.projectName || "Không rõ dự án"}
                </div>
                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    disabled={busyId === actionItem.id}
                    onClick={() => {
                      const item = actionItem;
                      setActionItem(null);
                      openDoneModal(item);
                    }}
                    className="flex w-full items-center justify-between rounded-[10px] border border-[#2d3249] bg-[#13151f] px-[14px] py-[10px] text-[13px] font-semibold text-emerald-300 transition hover:bg-[#1f2436] active:scale-[0.97] disabled:opacity-50"
                  >
                    <span>Hoàn thành</span>
                    <span>›</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyId === actionItem.id}
                    onClick={() => {
                      const item = actionItem;
                      setActionItem(null);
                      openNotApplicableModal(item);
                    }}
                    className="flex w-full items-center justify-between rounded-[10px] border border-[#2d3249] bg-[#13151f] px-[14px] py-[10px] text-[13px] font-semibold text-[#8892b0] transition hover:bg-[#1f2436] active:scale-[0.97] disabled:opacity-50"
                  >
                    <span>N/A</span>
                    <span>›</span>
                  </button>
                  {actionItem.guideContent ? (
                    <button
                      type="button"
                      onClick={() => {
                        const item = actionItem;
                        setActionItem(null);
                        setGuideItem(item);
                      }}
                      className="flex w-full items-center justify-between rounded-[10px] border border-[#2d3249] bg-[#13151f] px-[14px] py-[10px] text-[13px] font-semibold text-orange-300 transition hover:bg-[#1f2436] active:scale-[0.97]"
                    >
                      <span>Hướng dẫn</span>
                      <span>›</span>
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => setActionItem(null)} className="rounded-lg border border-[#252840] px-3 py-2 text-xs font-semibold text-[#f0f2ff]">
                    Đóng
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {tptcActionItem && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop-in fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3">
              <div className="modal-panel-in w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 shadow-2xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-orange-300">⚡ Việc TPTC giao</div>
                  {tptcActionItem.priority !== "normal" ? (
                    <div
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        tptcActionItem.priority === "critical"
                          ? "bg-red-500/15 text-red-300"
                          : tptcActionItem.priority === "urgent"
                          ? "bg-orange-500/15 text-orange-300"
                          : "bg-blue-500/15 text-blue-300"
                      }`}
                    >
                      {tptcActionItem.priority === "critical"
                        ? "🔴 CỰC KHẨN"
                        : tptcActionItem.priority === "urgent"
                        ? "🟧 KHẨN"
                        : "🟦 QUAN TRỌNG"}
                    </div>
                  ) : null}
                </div>

                <div className="mt-2 text-base font-bold leading-6 text-[#f0f2ff]">{tptcActionItem.title}</div>

                <div className="mt-3 space-y-1 text-xs leading-5 text-[#b6c0e0]">
                  <div>🏠 {tptcActionItem.projectName || "Không rõ dự án"}</div>
                  {tptcActionItem.tptcAssignerName ? (
                    <div>👤 Giao bởi: {tptcActionItem.tptcAssignerName}</div>
                  ) : null}
                  {tptcActionItem.dueAt ? (
                    <div>⏰ Hạn: {formatDueWithCountdown(tptcActionItem.dueAt)}</div>
                  ) : null}
                </div>

                {tptcActionItem.tptcDescription ? (
                  <div className="mt-3 rounded-xl border border-[#252840] bg-[#13151f] p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8892b0]">📝 Mô tả từ TPTC</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[#f0f2ff]">{tptcActionItem.tptcDescription}</div>
                  </div>
                ) : null}

                {tptcActionItem.tptcStatus === "rejected" && tptcActionItem.tptcReviewNote ? (
                  <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">⚠ TPTC yêu cầu làm lại</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm leading-5 text-amber-100">{tptcActionItem.tptcReviewNote}</div>
                  </div>
                ) : null}

                {tptcActionItem.tptcDailyStatus === "working_on_today" ? (
                  <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-200">
                    ✓ Hôm nay: <b>Đang làm</b>
                  </div>
                ) : tptcActionItem.tptcDailyStatus === "not_today" ? (
                  <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
                    ⏸ Hôm nay: <b>Chưa làm</b>
                    {tptcActionItem.tptcDailyNote ? (
                      <div className="mt-1 whitespace-pre-wrap text-amber-100/90">Lý do: {tptcActionItem.tptcDailyNote}</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs leading-5 text-blue-100">
                    💡 Cập nhật trạng thái nhiệm vụ
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    disabled={busyId === tptcActionItem.id}
                    onClick={() => markWorkingOnToday(tptcActionItem)}
                    className="flex w-full items-center justify-between rounded-[10px] border border-blue-500/30 bg-blue-500/10 px-[14px] py-[10px] text-[13px] font-semibold text-blue-200 transition active:scale-[0.97] disabled:opacity-50"
                  >
                    <span>🔨 Đang làm hôm nay</span>
                    <span>›</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyId === tptcActionItem.id}
                    onClick={() => openNotTodayModal(tptcActionItem)}
                    className="flex w-full items-center justify-between rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-[14px] py-[10px] text-[13px] font-semibold text-amber-200 transition active:scale-[0.97] disabled:opacity-50"
                  >
                    <span>⏸ Chưa làm hôm nay vì...</span>
                    <span>›</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyId === tptcActionItem.id}
                    onClick={() => {
                      const item = tptcActionItem;
                      setTptcActionItem(null);
                      openDoneModal(item);
                    }}
                    className="flex w-full items-center justify-between rounded-[10px] border border-emerald-500/30 bg-emerald-500/10 px-[14px] py-[10px] text-[13px] font-semibold text-emerald-300 transition active:scale-[0.97] disabled:opacity-50"
                  >
                    <span>✅ Báo xong</span>
                    <span>›</span>
                  </button>
                </div>

                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => setTptcActionItem(null)} className="rounded-lg border border-[#252840] px-3 py-2 text-xs font-semibold text-[#f0f2ff]">
                    Đóng
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {notTodayItem && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop-in fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3">
              <div className="modal-panel-in w-full max-w-md rounded-2xl border border-amber-500/40 bg-[#1a1d2e] p-4 shadow-2xl">
                <div className="text-[10px] font-bold uppercase tracking-wide text-amber-300">⏸ Chưa làm hôm nay</div>
                <div className="mt-1 text-sm font-bold leading-5 text-[#f0f2ff]">{notTodayItem.title}</div>
                <div className="mt-3 text-xs text-[#8892b0]">Nhập lý do để TPTC biết bạn không quên việc này.</div>
                <textarea
                  value={notTodayNote}
                  onChange={(e) => setNotTodayNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Ví dụ: chờ vật tư, bận task khác cao hơn, mưa..."
                  className="mt-2 w-full rounded-[10px] border border-[#252840] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff] placeholder:text-[#5a627a]"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNotTodayItem(null);
                      setNotTodayNote("");
                    }}
                    className="rounded-lg border border-[#252840] px-3 py-2 text-xs font-semibold text-[#f0f2ff]"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    disabled={busyId === notTodayItem.id}
                    onClick={confirmNotToday}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-200 transition active:scale-[0.97] disabled:opacity-50"
                  >
                    {busyId === notTodayItem.id ? "Đang lưu..." : "Lưu lý do"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {ackTptcItem && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop-in fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3">
              <div className="modal-panel-in w-full max-w-md rounded-2xl border border-orange-500/40 bg-[#1a1d2e] p-4 shadow-2xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-orange-300">📥 Việc TPTC mới giao</div>
                  {ackTptcItem.priority !== "normal" ? (
                    <div
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        ackTptcItem.priority === "critical"
                          ? "bg-red-500/15 text-red-300"
                          : ackTptcItem.priority === "urgent"
                          ? "bg-orange-500/15 text-orange-300"
                          : "bg-blue-500/15 text-blue-300"
                      }`}
                    >
                      {ackTptcItem.priority === "critical"
                        ? "🔴 CỰC KHẨN"
                        : ackTptcItem.priority === "urgent"
                        ? "🟧 KHẨN"
                        : "🟦 QUAN TRỌNG"}
                    </div>
                  ) : null}
                </div>

                <div className="mt-1 text-[11px] text-[#8892b0]">Đọc kỹ trước khi thực hiện</div>

                <div className="mt-3 text-base font-bold leading-6 text-[#f0f2ff]">{ackTptcItem.title}</div>

                <div className="mt-2 space-y-1 text-xs leading-5 text-[#b6c0e0]">
                  <div>🏠 {ackTptcItem.projectName || "Không rõ dự án"}</div>
                  {ackTptcItem.tptcAssignerName ? (
                    <div>👤 Giao bởi: {ackTptcItem.tptcAssignerName}</div>
                  ) : null}
                  {ackTptcItem.dueAt ? (
                    <div>⏰ Hạn: {formatDueWithCountdown(ackTptcItem.dueAt)}</div>
                  ) : null}
                </div>

                {ackTptcItem.tptcDescription ? (
                  <div className="mt-3 rounded-xl border border-[#252840] bg-[#13151f] p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8892b0]">📝 Mô tả từ TPTC</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[#f0f2ff]">{ackTptcItem.tptcDescription}</div>
                  </div>
                ) : null}

                <div className="mt-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs leading-5 text-blue-100">
                  💡 Nhiệm vụ này sẽ nằm trong <b>Danh sách nhiệm vụ</b> với nhãn <b>⚡ TPTC giao</b>. Khi hoàn thành, hãy mở lại và bấm <b>Đánh dấu xong</b> để báo cáo cho TPTC.
                </div>

                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    disabled={busyId === ackTptcItem.id}
                    onClick={confirmAck}
                    className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-emerald-500/40 bg-emerald-500/15 px-[14px] py-[11px] text-[13px] font-bold text-emerald-200 transition active:scale-[0.97] disabled:opacity-50"
                  >
                    {busyId === ackTptcItem.id ? "Đang xác nhận..." : "✓ Đã hiểu, sẽ thực hiện"}
                  </button>
                </div>

                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={() => setAckTptcItem(null)} className="rounded-lg border border-[#252840] px-3 py-2 text-xs font-semibold text-[#f0f2ff]">
                    Để sau
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {doneModalItem && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop-in fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3">
              <div className="modal-panel-in w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 shadow-2xl">
                <div className="text-base font-bold text-[#f0f2ff]">
                  {doneModalItem.type === "tptc_assignment" ? "✅ Hoàn thành & báo cáo TPTC" : "✅ Đánh dấu hoàn thành"}
                </div>
                <div className="mt-1 text-sm text-[#8892b0]">{doneModalItem.title}</div>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-[#8892b0]">
                      📷 {doneModalItem.requirePhoto ? "Ảnh minh chứng (bắt buộc)" : "Ảnh minh chứng (khuyến nghị)"}
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={donePhotoBusy}
                      onChange={async (event) => {
                        await uploadDonePhotoFile(event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                      className="mt-1 w-full rounded-xl border border-[#252840] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff] file:mr-3 file:rounded-md file:border-0 file:bg-[#f97316] file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-black disabled:opacity-50"
                    />
                    <div className="mt-1 text-[11px] text-[#8892b0]">Chụp mới hoặc chọn ảnh từ thư viện. Ảnh chụp trong vòng 30 phút.</div>
                    {donePhotoBusy ? (
                      <div className="mt-2 text-[11px] text-[#8892b0]">⏳ Đang upload...</div>
                    ) : null}
                    {doneModalItem.taskId && doneUploadItems.length ? (
                      <TaskPhotoUploadStatus
                        items={doneUploadItems}
                        onClear={() => {
                          clearDoneUploads();
                          setDonePhotoUrl("");
                        }}
                      />
                    ) : donePhotoUrl && !donePhotoBusy ? (
                      <div className="mt-2 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
                        <span>✓ Đã đính kèm ảnh</span>
                        <button type="button" onClick={() => setDonePhotoUrl("")} className="text-emerald-300 underline">Bỏ</button>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#8892b0]">
                      {doneModalItem.type === "tptc_assignment" ? "📝 Báo cáo cho TPTC *" : "📝 Ghi chú (tuỳ chọn)"}
                    </label>
                    <textarea
                      value={doneNote}
                      onChange={(e) => setDoneNote(e.target.value)}
                      placeholder={doneModalItem.type === "tptc_assignment" ? "Mô tả ngắn việc đã làm, kết quả, vấn đề (nếu có)..." : "Ghi chú (tuỳ chọn)"}
                      rows={3}
                      className="mt-1 w-full rounded-xl border border-[#252840] bg-[#13151f] px-3 py-2.5 text-sm text-[#f0f2ff]"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDoneModalItem(null);
                      clearDoneUploads();
                    }}
                    className="rounded-lg border border-[#252840] px-3 py-2 text-xs font-semibold text-[#f0f2ff]"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={busyId === doneModalItem.id}
                    onClick={confirmDone}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-200 disabled:opacity-50"
                  >
                    {busyId === doneModalItem.id ? "Đang xử lý..." : "Xác nhận"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {notApplicableItem && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop-in fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3">
              <div className="modal-panel-in w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 shadow-2xl">
                <div className="text-base font-bold text-[#f0f2ff]">⊘ Đánh dấu không áp dụng</div>
                <div className="mt-2 text-sm leading-6 text-[#f0f2ff]">Xác nhận đánh dấu &quot;{notApplicableItem.title}&quot; là không áp dụng?</div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setNotApplicableItem(null)} className="rounded-lg border border-[#252840] px-3 py-2 text-xs font-semibold text-[#f0f2ff]">
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={busyId === notApplicableItem.id}
                    onClick={confirmNotApplicable}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-200 disabled:opacity-50"
                  >
                    {busyId === notApplicableItem.id ? "Đang xử lý..." : "Xác nhận"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {progressModalItem && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop-in fixed inset-0 z-[100] flex items-end justify-center overflow-hidden bg-black/65 p-3 sm:items-center">
              <div className="modal-sheet-in flex max-h-[calc(100dvh-24px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[#252840] bg-[#1a1d2e] shadow-2xl sm:max-h-[92dvh] sm:rounded-2xl">
                <div className="shrink-0 border-b border-[#252840] p-4">
                  <div className="text-lg font-bold text-[#f0f2ff]">📈 Cập nhật tiến độ</div>
                  <div className="mt-1 text-sm text-[#8892b0]">
                    {progressModalItem.taskName
                      ? `${progressModalItem.taskCode ? `${progressModalItem.taskCode} · ` : ""}${progressModalItem.taskName}`
                      : progressModalItem.title}
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
                  <div className="rounded-2xl border border-[#252840] bg-[#13151f] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[#f0f2ff]">Tiến độ mới</div>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={progressPercent}
                        onChange={(e) => setProgressPercent(Number(e.target.value))}
                        className="w-20 rounded-lg border border-[#252840] bg-[#1a1d2e] px-2 py-1.5 text-center text-sm font-bold text-[#f0f2ff]"
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
                    <div className="mt-2 flex justify-between text-[11px] text-[#8892b0]">
                      <span>0%</span>
                      <span className="font-semibold text-[#f97316]">{progressPercent}%</span>
                      <span>100%</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#252840] bg-[#13151f] p-4">
                    <div className="text-sm font-semibold text-[#f0f2ff]">Ảnh minh chứng</div>
                    <div className="mt-1 text-xs text-[#8892b0]">Chọn ảnh từ điện thoại, hệ thống sẽ upload vào task rồi gắn vào cập nhật tiến độ.</div>
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (event) => {
                        await uploadProgressPhotoFiles(event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                      className="mt-3 w-full rounded-lg border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-sm text-[#f0f2ff] file:mr-3 file:rounded-md file:border-0 file:bg-[#f97316] file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-black"
                    />
                    {progressUploadItems.length > 0 ? (
                      <TaskPhotoUploadStatus
                        items={progressUploadItems}
                        onClear={() => {
                          clearProgressUploads();
                          setProgressPhotos([]);
                          removedProgressUploadIdsRef.current = new Set();
                        }}
                        onRemove={(item) => {
                          removedProgressUploadIdsRef.current.add(item.id);
                          removeProgressUploadItem(item.id);
                          if (item.photo?.photoUrl) removeProgressPhoto(item.photo.photoUrl);
                        }}
                      />
                    ) : null}
                  </div>

                  <input
                    value={progressReason}
                    onChange={(e) => setProgressReason(e.target.value)}
                    placeholder="Lý do (bắt buộc khi giảm tiến độ)"
                    className="w-full rounded-xl border border-[#252840] bg-[#13151f] px-3 py-2.5 text-sm text-[#f0f2ff]"
                  />
                  <textarea
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                    placeholder="Ghi chú (tuỳ chọn)"
                    rows={3}
                    className="w-full rounded-xl border border-[#252840] bg-[#13151f] px-3 py-2.5 text-sm text-[#f0f2ff]"
                  />
                </div>

                <div className="flex shrink-0 justify-end gap-2 border-t border-[#252840] bg-[#1a1d2e] p-4">
                  <button
                    type="button"
                    onClick={() => {
                      setProgressModalItem(null);
                      setProgressPhotos([]);
                      removedProgressUploadIdsRef.current = new Set();
                      clearProgressUploads();
                    }}
                    className="rounded-lg border border-[#252840] px-3 py-2 text-xs font-semibold text-[#f0f2ff]"
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

      {guideItem && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop-in fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3">
              <div className="modal-panel-in flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 shadow-2xl">
                <div className="shrink-0 text-base font-bold text-[#f0f2ff]">📖 {guideItem.title}</div>
                <div className="mt-3 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-[#f0f2ff]">{guideItem.guideContent}</div>
                <div className="mt-4 flex shrink-0 justify-end">
                  <button type="button" onClick={() => setGuideItem(null)} className="rounded-lg border border-[#252840] px-3 py-2 text-xs font-semibold text-[#f0f2ff]">
                    Đóng
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {submitConfirmOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop-in fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3">
              <div className="modal-panel-in w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 shadow-2xl">
                <div className="text-base font-bold text-[#f0f2ff]">📤 Gửi báo cáo cuối ngày</div>
                <div className="mt-2 text-sm leading-6 text-[#f0f2ff]">Xác nhận gửi báo cáo hôm nay?</div>
                <div className="mt-2 text-xs text-[#8892b0]">
                  ✅ {today.stats.done} · ⊘ {today.stats.notApplicable} · ☐ {today.stats.pending}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setSubmitConfirmOpen(false)} className="rounded-lg border border-[#252840] px-3 py-2 text-xs font-semibold text-[#f0f2ff]">
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={busyId === "submit"}
                    onClick={submitDayReport}
                    className="rounded-lg border border-[#f97316]/30 bg-[#f97316]/10 px-4 py-2 text-xs font-bold text-[#f97316] disabled:opacity-50"
                  >
                    {busyId === "submit" ? "Đang gửi..." : "Xác nhận gửi"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
