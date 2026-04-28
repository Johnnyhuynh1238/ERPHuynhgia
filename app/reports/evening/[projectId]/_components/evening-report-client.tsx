"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DailyRating, ReportDecision } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type SitePhoto = {
  id: string;
  photoUrl: string;
  thumbnailUrl: string;
  caption: string | null;
};

type TaskPhoto = {
  id: string;
  taskId: string;
  photoUrl: string;
  thumbnailUrl: string;
  caption: string | null;
};

type QcStatusItem = {
  qcItemId: string;
  name: string;
  status: "pass" | "fail" | "pending";
};

type EveningTaskRow = {
  taskId: string;
  code: string;
  name: string;
  phase: string;
  decision: ReportDecision;
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
  taskPhotos: TaskPhoto[];
  eveningTaskId: string | null;
  markAsDone: boolean;
  qcStatusItems?: QcStatusItem[];
  qcCheckedCount?: number;
  qcTotalCount?: number;
};

type EveningReportTaskPayload = {
  id: string;
  taskId: string;
  completionPercent: number | null;
  actualWork: string | null;
  issues: string | null;
  rating: DailyRating | null;
  explanation: string | null;
  stillPaused: boolean | null;
  actualWorkIfStarted: string | null;
  taskPhotos?: TaskPhoto[];
};

type EveningReportPayload = {
  id: string;
  submittedAt: string | null;
  isOnTime: boolean;
  issues: string | null;
  overallRating: DailyRating;
  overallNote: string | null;
  sitePhotos?: SitePhoto[];
  taskReports?: EveningReportTaskPayload[];
};

function formatDate(dateIso: string) {
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toYmd(dateIso: string) {
  return dateIso.slice(0, 10);
}

function formatTime(dateIso: string | null) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function computeEveningDeadlineLabel(reportDateIso: string) {
  const reportDate = new Date(reportDateIso);
  const deadline = new Date(reportDate.getUTCFullYear(), reportDate.getUTCMonth(), reportDate.getUTCDate(), 19, 0, 0, 0);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();

  if (diffMs <= 0) return "Đã quá hạn 19h";

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `Còn ${hours}h ${minutes}p tới 19h`;
}

function submittedLabel(submittedAt: string | null, isOnTime: boolean) {
  if (!submittedAt) return "Chưa nộp";
  if (isOnTime) return `Đã nộp lúc ${formatTime(submittedAt)} ✓`;
  return `Nộp trễ lúc ${formatTime(submittedAt)}`;
}

export function EveningReportClient({
  project,
  reportDate,
  isGoLive,
  siteRestDay,
  requiresMorning,
  morningReportSubmittedAt,
  eveningReport,
  initialTasks,
  initialSitePhotos,
}: {
  project: { id: string; code: string; name: string };
  reportDate: string;
  isGoLive: boolean;
  siteRestDay: { id: string; reason: string; note: string | null } | null;
  requiresMorning: boolean;
  morningReportSubmittedAt: string | null;
  eveningReport: { id: string; submittedAt: string | null; isOnTime: boolean; issues: string | null; overallRating: DailyRating; overallNote: string | null } | null;
  initialTasks: EveningTaskRow[];
  initialSitePhotos: SitePhoto[];
}) {
  const [tasks, setTasks] = useState<EveningTaskRow[]>(initialTasks);
  const [sitePhotos, setSitePhotos] = useState<SitePhoto[]>(initialSitePhotos);
  const [issues, setIssues] = useState(eveningReport?.issues || "");
  const [overallRating, setOverallRating] = useState<DailyRating | null>(eveningReport?.overallRating || null);
  const [overallNote, setOverallNote] = useState(eveningReport?.overallNote || "");
  const [submittedAt, setSubmittedAt] = useState<string | null>(eveningReport?.submittedAt || null);
  const [isOnTime, setIsOnTime] = useState(Boolean(eveningReport?.isOnTime));
  const [saving, setSaving] = useState(false);
  const [reportId, setReportId] = useState<string | null>(eveningReport?.id || null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [qcSheetTaskId, setQcSheetTaskId] = useState<string | null>(null);
  const [qcDraftChecked, setQcDraftChecked] = useState<Record<string, boolean>>({});
  const [qcDraftNote, setQcDraftNote] = useState("");
  const [savingQcBatch, setSavingQcBatch] = useState(false);

  function updateTask(taskId: string, patch: Partial<EveningTaskRow>) {
    setTasks((prev) => prev.map((task) => (task.taskId === taskId ? { ...task, ...patch } : task)));
  }

  async function loadTaskQcStatus(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}/qc-status`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || "Không tải được QC status");
    const qcStatusItems = (json.items || []) as QcStatusItem[];
    updateTask(taskId, {
      qcStatusItems,
      qcCheckedCount: qcStatusItems.filter((x) => x.status !== "pending").length,
      qcTotalCount: qcStatusItems.length,
    });
  }

  const qcSheetTask = useMemo(() => tasks.find((x) => x.taskId === qcSheetTaskId) || null, [tasks, qcSheetTaskId]);

  function closeQcSheet() {
    setQcSheetTaskId(null);
    setQcDraftChecked({});
    setQcDraftNote("");
    setSavingQcBatch(false);
  }

  async function openQcSheet(taskId: string) {
    try {
      await loadTaskQcStatus(taskId);
      const t = tasks.find((x) => x.taskId === taskId);
      const items = t?.qcStatusItems || [];
      const pendingItems = items.filter((x) => x.status === "pending");
      if (pendingItems.length === 0) {
        toast.success("QC task này đã check hết");
        return;
      }

      const init: Record<string, boolean> = {};
      pendingItems.forEach((x) => {
        init[x.qcItemId] = false;
      });
      setQcDraftChecked(init);
      setQcDraftNote("");
      setQcSheetTaskId(taskId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không mở được sheet QC");
    }
  }

  async function saveQcBatch() {
    if (!qcSheetTask) return;

    const selectedIds = Object.entries(qcDraftChecked)
      .filter(([, checked]) => checked)
      .map(([id]) => id);

    if (selectedIds.length === 0) {
      toast.error("Chọn ít nhất 1 tiêu chí để lưu QC");
      return;
    }

    setSavingQcBatch(true);
    try {
      const draftId = await ensureDraftReport();
      const note = qcDraftNote.trim() || "Check QC hôm nay";

      await Promise.all(
        selectedIds.map(async (qcItemId) => {
          const res = await fetch(`/api/tasks/${qcSheetTask.taskId}/qc-logs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ qcItemId, eveningReportId: draftId, note }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.message || "Lưu QC thất bại");
        }),
      );

      await loadTaskQcStatus(qcSheetTask.taskId);
      toast.success(`Đã lưu QC ${selectedIds.length} tiêu chí`);
      closeQcSheet();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lưu QC thất bại");
    } finally {
      setSavingQcBatch(false);
    }
  }

  function mapTaskFromPayload(existingTask: EveningTaskRow, reportTask: EveningReportTaskPayload): EveningTaskRow {
    return {
      ...existingTask,
      eveningTaskId: reportTask.id,
      completionPercent: reportTask.completionPercent ?? null,
      actualWork: reportTask.actualWork ?? "",
      issues: reportTask.issues ?? "",
      rating: reportTask.rating ?? null,
      explanation: reportTask.explanation ?? "",
      stillPaused: reportTask.stillPaused ?? null,
      actualWorkIfStarted: reportTask.actualWorkIfStarted ?? "",
      taskPhotos: reportTask.taskPhotos ?? [],
      taskPhotoIds: (reportTask.taskPhotos ?? []).map((photo) => photo.id),
      markAsDone: (reportTask.completionPercent ?? 0) === 100,
    };
  }

  function syncFromReport(report: EveningReportPayload) {
    setReportId(report.id);
    setSubmittedAt(report.submittedAt || null);
    setIsOnTime(Boolean(report.isOnTime));
    setIssues(report.issues || "");
    setOverallRating(report.overallRating || null);
    setOverallNote(report.overallNote || "");
    setSitePhotos(report.sitePhotos || []);
    const taskReports = report.taskReports || [];
    const reportTaskByTaskId = new Map(taskReports.map((task) => [task.taskId, task]));
    setTasks((prev) => prev.map((task) => {
      const reportTask = reportTaskByTaskId.get(task.taskId);
      if (!reportTask) {
        return {
          ...task,
          eveningTaskId: null,
          taskPhotos: [],
          taskPhotoIds: [],
        };
      }
      return mapTaskFromPayload(task, reportTask);
    }));
  }

  async function ensureDraftReport() {
    if (reportId) return reportId;

    const res = await fetch("/api/reports/evening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        reportDate: toYmd(reportDate),
        issues: issues.trim() || null,
        overallRating: overallRating || DailyRating.MET,
        overallNote: overallNote.trim() || null,
        submit: false,
        tasks: tasks.map((task) => ({
          taskId: task.taskId,
          completionPercent: task.completionPercent,
          actualWork: task.actualWork,
          issues: task.issues,
          rating: task.rating,
          explanation: task.explanation,
          stillPaused: task.stillPaused,
          actualWorkIfStarted: task.actualWorkIfStarted,
          taskPhotoIds: task.taskPhotoIds,
          markAsDone: task.markAsDone,
        })),
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || "Không thể tạo báo cáo nháp");
    }

    const id = json.report?.id as string | undefined;
    if (!id) {
      throw new Error("Không thể tạo báo cáo nháp");
    }

    if (json.report) {
      syncFromReport(json.report as EveningReportPayload);
    } else {
      setReportId(id);
    }

    return id;
  }

  async function uploadSitePhotos(files: FileList | null) {
    if (!files || files.length === 0) return;

    try {
      const id = await ensureDraftReport();
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));

      const res = await fetch(`/api/reports/evening/${id}/photos`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message || "Upload ảnh toàn cảnh thất bại");
        return;
      }

      const uploaded = (json.photos || []) as SitePhoto[];
      setSitePhotos((prev) => [...uploaded, ...prev]);
      toast.success(json.message || "Đã upload ảnh toàn cảnh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload ảnh toàn cảnh thất bại");
    }
  }

  async function removeSitePhoto(photoId: string) {
    if (!reportId) return;

    const res = await fetch(`/api/reports/evening/${reportId}/photos?photoId=${photoId}`, {
      method: "DELETE",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không thể xóa ảnh toàn cảnh");
      return;
    }

    setSitePhotos((prev) => prev.filter((photo) => photo.id !== photoId));
    toast.success(json.message || "Đã xóa ảnh toàn cảnh");
  }

  async function uploadTaskPhotos(taskId: string, files: FileList | null) {
    if (!files || files.length === 0) return;

    try {
      const id = await ensureDraftReport();
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));

      const res = await fetch(`/api/reports/evening/${id}/task-photos/${taskId}`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message || "Upload ảnh task thất bại");
        return;
      }

      const newPhotos = ((json.photos || []) as TaskPhoto[]).map((photo) => ({
        id: photo.id,
        taskId: photo.taskId,
        photoUrl: photo.photoUrl,
        thumbnailUrl: photo.thumbnailUrl,
        caption: photo.caption,
      }));

      setTasks((prev) =>
        prev.map((task) => {
          if (task.taskId !== taskId) return task;
          const nextPhotos = [...newPhotos, ...task.taskPhotos];
          return {
            ...task,
            taskPhotos: nextPhotos,
            taskPhotoIds: nextPhotos.map((photo) => photo.id),
          };
        }),
      );

      toast.success(json.message || "Đã upload ảnh task");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload ảnh task thất bại");
    }
  }

  async function removeTaskPhoto(taskId: string, photoId: string) {
    if (!reportId) return;

    const res = await fetch(`/api/reports/evening/${reportId}/task-photos/${taskId}?photoId=${photoId}`, {
      method: "DELETE",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không thể xóa ảnh task");
      return;
    }

    setTasks((prev) =>
      prev.map((task) => {
        if (task.taskId !== taskId) return task;
        const nextPhotos = task.taskPhotos.filter((photo) => photo.id !== photoId);
        return {
          ...task,
          taskPhotos: nextPhotos,
          taskPhotoIds: nextPhotos.map((photo) => photo.id),
        };
      }),
    );

    toast.success(json.message || "Đã xóa ảnh task");
  }

  function validateBeforeSubmit() {
    if (!overallRating) return "Phải chọn đánh giá tổng cuối ngày";

    if (sitePhotos.length < 1 || sitePhotos.length > 3) {
      return "Ảnh toàn cảnh công trường phải từ 1 đến 3 ảnh";
    }

    for (const task of tasks) {
      if (task.decision === ReportDecision.WORK) {
        if (task.completionPercent === null || task.completionPercent < 0 || task.completionPercent > 100) {
          return `Task ${task.code}: % khối lượng phải từ 0 đến 100`;
        }
        if (task.actualWork.trim().length < 5) {
          return `Task ${task.code}: Thực tế đã làm tối thiểu 5 ký tự`;
        }
        if (!task.rating) {
          return `Task ${task.code}: Phải chọn đánh giá task`;
        }
        if (task.rating === DailyRating.UNDER && task.explanation.trim().length < 5) {
          return `Task ${task.code}: Không đạt kế hoạch phải có giải thích`;
        }
        if (task.taskPhotoIds.length < 1) {
          return `Task ${task.code}: WORK phải có ít nhất 1 ảnh`;
        }
        continue;
      }

      if (task.stillPaused === null) {
        return `Task ${task.code}: Phải xác nhận trạng thái tạm dừng`;
      }

      if (task.stillPaused === false) {
        if (task.actualWorkIfStarted.trim().length < 5) {
          return `Task ${task.code}: Khi đã bắt đầu lại cần nhập nội dung thực tế`;
        }
        if (task.taskPhotoIds.length < 1) {
          return `Task ${task.code}: Khi đã bắt đầu lại phải có ít nhất 1 ảnh`;
        }
      }
    }

    return null;
  }

  async function submitReport(submit: boolean) {
    if (submit) {
      const validationError = validateBeforeSubmit();
      if (validationError) {
        toast.error(validationError);
        return;
      }

      const ok = window.confirm("Xác nhận chốt báo cáo chiều?");
      if (!ok) return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/reports/evening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          reportDate: toYmd(reportDate),
          issues: issues.trim() || null,
          overallRating: overallRating || null,
          overallNote: overallNote.trim() || null,
          submit,
          tasks: tasks.map((task) => ({
            taskId: task.taskId,
            completionPercent: task.completionPercent,
            actualWork: task.actualWork,
            issues: task.issues,
            rating: task.rating,
            explanation: task.explanation,
            stillPaused: task.stillPaused,
            actualWorkIfStarted: task.actualWorkIfStarted,
            taskPhotoIds: task.taskPhotoIds,
            markAsDone: task.markAsDone,
          })),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message || "Không thể lưu báo cáo chiều");
        return;
      }

      if (json.report) {
        syncFromReport(json.report as EveningReportPayload);
      }

      toast.success(json.message || (submit ? "Đã chốt báo cáo chiều" : "Đã lưu tạm báo cáo chiều"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể lưu báo cáo chiều");
    } finally {
      setSaving(false);
    }
  }

  const dayName = new Date(reportDate).toLocaleDateString("vi-VN", { weekday: "long" });
  const canEdit = !submittedAt;

  useEffect(() => {
    if (tasks.length === 0) {
      setCurrentStep(0);
      return;
    }
    if (currentStep > tasks.length - 1) {
      setCurrentStep(tasks.length - 1);
    }
  }, [tasks.length, currentStep]);

  useEffect(() => {
    tasks.forEach((t) => {
      loadTaskQcStatus(t.taskId).catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGoBackStep = tasks.length > 0 && currentStep > 0;
  const canProgressStep = tasks.length > 0 && currentStep < tasks.length - 1;
  const activeTask = tasks[currentStep] || null;

  function renderTaskCard(task: EveningTaskRow) {
    return (
      <div key={task.taskId} className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-semibold text-orange-300">{task.code}</div>
          <div className="rounded bg-slate-100 px-2 py-0.5 text-xs">{task.phase}</div>
        </div>
        <div className="mt-1 font-medium">{task.name}</div>

        {task.decision === ReportDecision.WORK ? (
          <div className="mt-3 space-y-3 text-sm">
            <div className="rounded bg-slate-50 p-3">Kế hoạch sáng: {task.plannedActivity || "-"}</div>
            <div>
              <label className="mb-1 block">% khối lượng hoàn thành hôm nay</label>
              <input
                type="number"
                min={0}
                max={100}
                className="w-full rounded border px-3 py-2"
                value={task.completionPercent ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  updateTask(task.taskId, { completionPercent: value === "" ? null : Number(value) });
                }}
              />
            </div>
            <div>
              <label className="mb-1 block">Thực tế đã làm</label>
              <textarea
                className="w-full rounded border px-3 py-2"
                rows={3}
                value={task.actualWork}
                onChange={(e) => updateTask(task.taskId, { actualWork: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block">Phát sinh</label>
              <textarea
                className="w-full rounded border px-3 py-2"
                rows={2}
                value={task.issues}
                onChange={(e) => updateTask(task.taskId, { issues: e.target.value })}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <label className="mb-1 block">Đánh giá task</label>
                <select
                  className="w-full rounded border px-3 py-2"
                  value={task.rating || ""}
                  onChange={(e) => updateTask(task.taskId, { rating: (e.target.value || null) as DailyRating | null })}
                >
                  <option value="">Chọn</option>
                  <option value={DailyRating.MET}>Đạt kế hoạch</option>
                  <option value={DailyRating.UNDER}>Không đạt kế hoạch</option>
                  <option value={DailyRating.OVER}>Vượt kế hoạch</option>
                </select>
              </div>
              <label className="mt-6 inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={task.markAsDone}
                  onChange={(e) => updateTask(task.taskId, { markAsDone: e.target.checked })}
                  disabled={task.completionPercent !== 100}
                />
                Task hoàn thành hoàn toàn (set done)
              </label>
            </div>
            {task.rating === DailyRating.UNDER ? (
              <div>
                <label className="mb-1 block">Giải thích</label>
                <textarea
                  className="w-full rounded border px-3 py-2"
                  rows={2}
                  value={task.explanation}
                  onChange={(e) => updateTask(task.taskId, { explanation: e.target.value })}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <div className="rounded bg-slate-50 p-3">Sáng tạm dừng: {task.pauseReason || "-"} - {task.pauseNote || "-"}</div>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={task.stillPaused === true}
                  onChange={() => updateTask(task.taskId, { stillPaused: true })}
                />
                Vẫn tạm dừng
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={task.stillPaused === false}
                  onChange={() => updateTask(task.taskId, { stillPaused: false })}
                />
                Đã bắt đầu được
              </label>
            </div>
            {task.stillPaused === false ? (
              <div>
                <label className="mb-1 block">Đã làm được gì</label>
                <textarea
                  className="w-full rounded border px-3 py-2"
                  rows={3}
                  value={task.actualWorkIfStarted}
                  onChange={(e) => updateTask(task.taskId, { actualWorkIfStarted: e.target.value })}
                />
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-3 rounded border bg-slate-50 p-3">
          <label className="mb-2 block text-sm font-medium">Ảnh task</label>
          <input type="file" multiple accept="image/*" disabled={!canEdit} onChange={(e) => uploadTaskPhotos(task.taskId, e.target.files)} />
          <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-5">
            {task.taskPhotos.map((photo) => (
              <div key={photo.id} className="space-y-1">
                <Image src={photo.thumbnailUrl} alt="task" width={200} height={200} className="h-20 w-full rounded object-cover" />
                <button type="button" className="text-xs text-red-600 underline" onClick={() => removeTaskPhoto(task.taskId, photo.id)}>
                  Xóa
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded border bg-emerald-50 p-3 text-sm">
          <div className="font-medium">QC hôm nay: {task.qcCheckedCount || 0}/{task.qcTotalCount || 0} tiêu chí đã check ✅</div>
          <Button type="button" className="mt-2" variant="outline" onClick={() => openQcSheet(task.taskId)}>
            📋 Check QC hôm nay
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="text-xs text-slate-500">{project.code}</div>
        <h1 className="text-2xl font-semibold text-orange-300">Báo cáo chiều · {project.name}</h1>
        <div className="mt-1 text-sm text-slate-600">
          {dayName}, {formatDate(reportDate)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{computeEveningDeadlineLabel(reportDate)}</div>
          <div className={`rounded-full px-3 py-1 text-xs ${submittedAt ? (isOnTime ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700") : "bg-blue-100 text-blue-700"}`}>
            {submittedLabel(submittedAt, isOnTime)}
          </div>
          <Link href={`/reports/morning/${project.id}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200">
            Xem báo cáo sáng
          </Link>
        </div>
      </div>

      {!isGoLive ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-700">
          Dự án chưa kích hoạt hệ thống báo cáo. Liên hệ admin.
        </div>
      ) : null}

      {siteRestDay ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
          Công trường nghỉ hôm nay ({siteRestDay.reason}){siteRestDay.note ? ` - ${siteRestDay.note}` : ""}. Không cần báo cáo.
        </div>
      ) : null}

      {requiresMorning ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-700">
          Phải có báo cáo sáng trước khi báo cáo chiều.
        </div>
      ) : null}

      {morningReportSubmittedAt ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Báo cáo sáng đã nộp lúc {formatTime(morningReportSubmittedAt)}.</div>
      ) : null}

      {isGoLive && !siteRestDay && !requiresMorning ? (
        <>
          {!canEdit ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
              Báo cáo đã chốt, chỉ có thể xem lại dữ liệu.
            </div>
          ) : null}
          <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
            {isReviewMode || !canEdit ? (
              <div className="space-y-3">
                {tasks.map((task) => renderTaskCard(task))}
              </div>
            ) : tasks.length ? (
              <div className="space-y-3">
                <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
                  <div className="font-medium text-slate-800">Nhập theo từng bước</div>
                  <div className="mt-1">Bước {currentStep + 1}/{tasks.length}</div>
                </div>
                {activeTask ? renderTaskCard(activeTask) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 0))} disabled={!canGoBackStep}>
                    Bước trước
                  </Button>
                  <Button variant="outline" onClick={() => setCurrentStep((prev) => Math.min(prev + 1, tasks.length - 1))} disabled={!canProgressStep}>
                    Bước tiếp theo
                  </Button>
                  <Button variant="outline" onClick={() => setIsReviewMode(true)}>
                    Xem lại toàn bộ
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border bg-white p-4 text-sm text-slate-500">Không có task cần báo cáo chiều hôm nay.</div>
            )}

          <div className="rounded-xl border bg-white p-4">
            <label className="mb-2 block text-sm font-medium">Phát sinh chung trong ngày</label>
            <textarea className="w-full rounded border px-3 py-2 text-sm" rows={3} value={issues} onChange={(e) => setIssues(e.target.value)} />
          </div>

          <div className="rounded-xl border bg-white p-4">
            <label className="mb-2 block text-sm font-medium">Ảnh toàn cảnh công trường (1-3 ảnh)</label>
            <input type="file" multiple accept="image/*" disabled={!canEdit} onChange={(e) => uploadSitePhotos(e.target.files)} />
            <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-5">
              {sitePhotos.map((photo) => (
                <div key={photo.id} className="space-y-1">
                  <Image src={photo.thumbnailUrl} alt="site" width={200} height={200} className="h-20 w-full rounded object-cover" />
                  <button type="button" className="text-xs text-red-600 underline" onClick={() => removeSitePhoto(photo.id)}>
                    Xóa
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <label className="mb-2 block text-sm font-medium">Đánh giá tổng cuối ngày</label>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={overallRating === DailyRating.MET} onChange={() => setOverallRating(DailyRating.MET)} />
                Đạt kế hoạch ngày
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={overallRating === DailyRating.UNDER} onChange={() => setOverallRating(DailyRating.UNDER)} />
                Không đạt kế hoạch ngày
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={overallRating === DailyRating.OVER} onChange={() => setOverallRating(DailyRating.OVER)} />
                Vượt kế hoạch ngày
              </label>
            </div>
            <textarea
              className="mt-3 w-full rounded border px-3 py-2 text-sm"
              rows={3}
              value={overallNote}
              onChange={(e) => setOverallNote(e.target.value)}
              placeholder="Ghi chú tổng"
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {isReviewMode && canEdit ? (
                <Button variant="outline" disabled={saving} onClick={() => setIsReviewMode(false)}>
                  Quay lại từng bước
                </Button>
              ) : null}
              <Button variant="outline" disabled={saving || !canEdit} onClick={() => submitReport(false)}>
                {saving ? "Đang lưu..." : "Lưu tạm"}
              </Button>
              <Button className="bg-orange-500 hover:bg-orange-600" disabled={saving || !canEdit} onClick={() => submitReport(true)}>
                {saving ? "Đang chốt..." : "Chốt báo cáo chiều"}
              </Button>
            </div>
          </div>
          </fieldset>
        </>
      ) : null}

      {qcSheetTask ? (
        <div className="fixed inset-0 z-50 bg-black/50 p-4" onClick={closeQcSheet}>
          <div className="mx-auto mt-8 w-full max-w-lg rounded-xl border bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-base font-semibold">Check QC – {qcSheetTask.code} {qcSheetTask.name}</div>
            <div className="space-y-2">
              {(qcSheetTask.qcStatusItems || [])
                .filter((item) => item.status === "pending")
                .map((item) => (
                  <label key={item.qcItemId} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(qcDraftChecked[item.qcItemId])}
                      onChange={(e) => setQcDraftChecked((prev) => ({ ...prev, [item.qcItemId]: e.target.checked }))}
                    />
                    <span>{item.name}</span>
                  </label>
                ))}
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium">Ghi chú QC (tuỳ chọn)</label>
              <textarea
                className="w-full rounded border px-3 py-2 text-sm"
                rows={2}
                value={qcDraftNote}
                onChange={(e) => setQcDraftNote(e.target.value)}
                placeholder="VD: Check QC hôm nay"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={closeQcSheet} disabled={savingQcBatch}>Đóng</Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={saveQcBatch} disabled={savingQcBatch}>
                {savingQcBatch ? "Đang lưu..." : "Lưu QC"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
