"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PHASE_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/lib/task-display";
import { QcSection } from "./qc-section";
import { MaterialSection } from "./material-section";
import { JournalSection } from "./journal-section";
import { TaskProgressSection } from "./task-progress-section";
import { TaskStatusFlow } from "./task-status-flow";

type TaskDetail = {
  id: string;
  code: string;
  phase: keyof typeof PHASE_LABEL;
  name: string;
  isMilestone: boolean;
  origin: "template" | "custom";
  category: "normal" | "internal_milestone" | "major_milestone";
  visibleToCustomer?: boolean;
  status: "not_started" | "in_progress" | "done" | "internal_approved" | "completed" | "inspected" | "delayed" | "na";
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
  offsetDays: number;
  durationDays: number;
  inspectorName: string;
  team: string | null;
  project: { id: string; code: string; name: string; projectManagerId: string; mainEngineerId: string };
  assignedEngineer: { id: string; fullName: string; email: string } | null;
  assignedForeman: { id: string; fullName: string; email: string } | null;
};

type TaskLog = {
  id: string;
  logType: string;
  content: string;
  createdAt: string;
  user: { fullName: string; email: string };
};

type OptionUser = { id: string; fullName: string; email: string };

const reportTypeConfig = {
  technical: { label: "Kỹ thuật", endpoint: "technical-reports" },
  material: { label: "Vật tư", endpoint: "material-reports" },
  labor: { label: "Nhân công", endpoint: "labor-reports" },
  equipment: { label: "Máy móc", endpoint: "equipment-reports" },
} as const;

type ReportType = keyof typeof reportTypeConfig;

type MainTab = "overview" | "progress" | "technical" | "material" | "labor" | "equipment" | "subcontractor" | "journal";
type TechnicalSubTab = "requirements" | "method" | "drawings" | "qc" | "today" | "history";
type ResourceSubTab = "today" | "history" | "planning";
type JournalSubTab = "all" | "photos" | "qc" | "issues";

function toInputDate(dateIso: string | null) {
  if (!dateIso) return "";
  return dateIso.slice(0, 10);
}

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function getTodayDateText() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function statusLabel(value: string | null | undefined) {
  if (value === "paused") return "Tạm dừng";
  if (value === "completed") return "Hoàn thành";
  return "Đang làm";
}

function parseTechnicalMeta(row: any) {
  if (!row?.note) return { entries: [] as any[] };
  try {
    const parsed = JSON.parse(row.note);
    if (parsed?.__guidedTechnicalReport === true) return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {}
  return { entries: [] as any[] };
}

function buildTechnicalNote(row: any, entry: any) {
  const current = parseTechnicalMeta(row);
  return JSON.stringify({
    __guidedTechnicalReport: true,
    version: 1,
    entries: [...current.entries, entry],
  });
}

function groupRowsByDay(rows: any[]) {
  return rows.reduce((acc: Record<string, any[]>, row: any) => {
    const day = String(row.reportDate).slice(0, 10);
    acc[day] = acc[day] || [];
    acc[day].push(row);
    return acc;
  }, {});
}

function parseMainTab(input: string | null): MainTab {
  const value = (input || "").toLowerCase();
  if (["overview", "progress", "technical", "material", "labor", "equipment", "subcontractor", "journal"].includes(value)) return value as MainTab;
  if (value === "qc") return "technical";
  if (value === "reports" || value === "history") return "technical";
  return "overview";
}

function parseLegacySub(input: string | null): ReportType {
  const value = (input || "").toLowerCase();
  if (["technical", "material", "labor", "equipment"].includes(value)) return value as ReportType;
  return "technical";
}

function detectMainFromReportType(type: ReportType): MainTab {
  if (type === "technical") return "technical";
  if (type === "material") return "material";
  if (type === "labor") return "labor";
  return "equipment";
}

export function TaskDetailClient({
  initialTask,
  initialLogs,
  engineers,
  foremen,
  currentUserId,
  currentUserRole,
  canManageQcItem,
}: {
  initialTask: TaskDetail;
  initialLogs: TaskLog[];
  initialPhotos: any[];
  engineers: OptionUser[];
  foremen: OptionUser[];
  currentUserId: string;
  currentUserRole: string;
  canManageQcItem: boolean;
}) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const subTabParam = searchParams.get("subTab") || searchParams.get("subtab");
  const initialLegacySub = parseLegacySub(subTabParam);
  const initialMain = parseMainTab(tabParam) === "technical" && tabParam === "reports" ? detectMainFromReportType(initialLegacySub) : parseMainTab(tabParam);

  const [task, setTask] = useState<TaskDetail>(initialTask);
  const [logs] = useState<TaskLog[]>(initialLogs);
  const [activeTab, setActiveTab] = useState<MainTab>(initialMain);
  const [technicalSubTab, setTechnicalSubTab] = useState<TechnicalSubTab>(tabParam === "history" ? "history" : "qc");
  const [materialSubTab, setMaterialSubTab] = useState<ResourceSubTab>(tabParam === "history" && initialLegacySub === "material" ? "history" : "today");
  const [laborSubTab, setLaborSubTab] = useState<ResourceSubTab>(tabParam === "history" && initialLegacySub === "labor" ? "history" : "today");
  const [equipmentSubTab, setEquipmentSubTab] = useState<ResourceSubTab>(tabParam === "history" && initialLegacySub === "equipment" ? "history" : "today");
  const [journalSubTab, setJournalSubTab] = useState<JournalSubTab>("all");

  const [reportRows, setReportRows] = useState<Record<ReportType, any[]>>({ technical: [], material: [], labor: [], equipment: [] });
  const [payloads, setPayloads] = useState<Record<ReportType, Record<string, any>>>({
    technical: { status: "working", progress: 0, progressSaved: false, assessment: "", assessmentNote: "", lesson: "" },
    material: { hasIssue: false, issueDescription: "", note: "" },
    labor: { masterWorkerCount: null, helperCount: null, note: "" },
    equipment: { note: "" },
  });
  const [pickedFiles, setPickedFiles] = useState<Record<ReportType, FileList | null>>({ technical: null, material: null, labor: null, equipment: null });
  const [technicalReportOpen, setTechnicalReportOpen] = useState(false);
  const [technicalReportStep, setTechnicalReportStep] = useState(1);
  const [savingTechnicalStatus, setSavingTechnicalStatus] = useState(false);
  const [deletingReportPhotoId, setDeletingReportPhotoId] = useState<string | null>(null);

  const [status, setStatus] = useState<TaskDetail["status"]>(initialTask.status);
  const [plannedStart, setPlannedStart] = useState(toInputDate(initialTask.plannedStartDate));
  const [plannedEnd, setPlannedEnd] = useState(toInputDate(initialTask.plannedEndDate));
  const [actualStart, setActualStart] = useState(toInputDate(initialTask.actualStartDate));
  const [actualEnd, setActualEnd] = useState(toInputDate(initialTask.actualEndDate));
  const [assignedEngineerId, setAssignedEngineerId] = useState(initialTask.assignedEngineer?.id || "");
  const [assignedForemanId, setAssignedForemanId] = useState(initialTask.assignedForeman?.id || "");
  const [team, setTeam] = useState(initialTask.team || "");
  const [inspectorName, setInspectorName] = useState(initialTask.inspectorName || "");
  const [visibleToCustomer, setVisibleToCustomer] = useState(Boolean(initialTask.visibleToCustomer));

  const canChangeStatus = currentUserRole === "admin" || currentUserRole === "construction_manager";
  const canEditDates = canChangeStatus || currentUserId === task.project.projectManagerId;
  const canAssign = canChangeStatus;
  const canUpdateQc =
    currentUserRole === "admin" ||
    currentUserRole === "construction_manager" ||
    currentUserId === task.project.mainEngineerId ||
    currentUserId === task.assignedEngineer?.id;

  useEffect(() => {
    const legacySub = parseLegacySub(subTabParam);
    const parsedMain = parseMainTab(tabParam);
    setActiveTab(parsedMain === "technical" && tabParam === "reports" ? detectMainFromReportType(legacySub) : parsedMain);

    if (tabParam === "history") {
      if (legacySub === "material") setMaterialSubTab("history");
      else if (legacySub === "labor") setLaborSubTab("history");
      else if (legacySub === "equipment") setEquipmentSubTab("history");
      else setTechnicalSubTab("history");
    }
  }, [tabParam, subTabParam]);

  function goBack() {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = `/projects/${task.project.id}/tasks`;
  }

  const tabs: { key: MainTab; label: string }[] = [
    { key: "overview", label: "Tổng quan" },
    { key: "progress", label: "Tiến độ" },
    { key: "technical", label: "QC" },
    { key: "material", label: "Vật tư" },
    { key: "labor", label: "Nhân công" },
    { key: "equipment", label: "Máy móc" },
    { key: "subcontractor", label: "Thầu phụ" },
    { key: "journal", label: "Nhật ký" },
  ];

  const technicalToday = useMemo(() => (reportRows.technical || []).find((r: any) => String(r.reportDate).slice(0, 10) === getTodayDateText()) || null, [reportRows.technical]);
  const materialToday = useMemo(() => (reportRows.material || []).find((r: any) => String(r.reportDate).slice(0, 10) === getTodayDateText()) || null, [reportRows.material]);
  const laborToday = useMemo(() => (reportRows.labor || []).find((r: any) => String(r.reportDate).slice(0, 10) === getTodayDateText()) || null, [reportRows.labor]);
  const equipmentToday = useMemo(() => (reportRows.equipment || []).find((r: any) => String(r.reportDate).slice(0, 10) === getTodayDateText()) || null, [reportRows.equipment]);

  const technicalHistory = useMemo(() => [...(reportRows.technical || [])].sort((a, b) => +new Date(b.reportDate) - +new Date(a.reportDate)), [reportRows.technical]);
  const materialHistory = useMemo(() => [...(reportRows.material || [])].sort((a, b) => +new Date(b.reportDate) - +new Date(a.reportDate)), [reportRows.material]);
  const laborHistory = useMemo(() => [...(reportRows.labor || [])].sort((a, b) => +new Date(b.reportDate) - +new Date(a.reportDate)), [reportRows.labor]);
  const equipmentHistory = useMemo(() => [...(reportRows.equipment || [])].sort((a, b) => +new Date(b.reportDate) - +new Date(a.reportDate)), [reportRows.equipment]);
  const technicalTodayMeta = useMemo(() => parseTechnicalMeta(technicalToday), [technicalToday]);
  const technicalTodayEntries = technicalTodayMeta.entries || [];
  const technicalHasGuidedReport = technicalTodayEntries.length > 0;
  const technicalHistoryGroups = useMemo(() => groupRowsByDay(technicalHistory), [technicalHistory]);

  const filteredLogs = useMemo(() => {
    if (journalSubTab === "all") return logs;
    if (journalSubTab === "photos") return logs.filter((x) => x.logType === "photo_uploaded" || x.content.toLowerCase().includes("ảnh"));
    if (journalSubTab === "qc") return logs.filter((x) => x.logType.toLowerCase().includes("qc") || x.content.toLowerCase().includes("qc"));
    return logs.filter((x) => x.content.toLowerCase().includes("vướng") || x.content.toLowerCase().includes("phát sinh") || x.content.toLowerCase().includes("issue"));
  }, [logs, journalSubTab]);

  async function patchTask(section: string, body: object) {
    const res = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, payload: body }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message || "Cập nhật thất bại");

    if (section === "assignment") {
      const payload = body as {
        assignedEngineerId?: string | null;
        assignedForemanId?: string | null;
        team?: string | null;
        inspectorName?: string;
      };
      setTask((prev) => ({
        ...prev,
        assignedEngineer: payload.assignedEngineerId ? engineers.find((u) => u.id === payload.assignedEngineerId) || prev.assignedEngineer : null,
        assignedForeman: payload.assignedForemanId ? foremen.find((u) => u.id === payload.assignedForemanId) || prev.assignedForeman : null,
        team: payload.team ?? prev.team,
        inspectorName: payload.inspectorName || prev.inspectorName,
      }));
    }

    toast.success(json.message || "Đã cập nhật");
  }

  const loadReportRows = useCallback(async (type: ReportType) => {
    const endpoint = reportTypeConfig[type].endpoint;
    const [res, photoRes] = await Promise.all([
      fetch(`/api/tasks/${task.id}/${endpoint}`, { cache: "no-store" }),
      fetch(`/api/tasks/${task.id}/report-photos?type=${type}`, { cache: "no-store" }),
    ]);
    const json = await res.json().catch(() => ({}));
    const photoJson = await photoRes.json().catch(() => ({}));
    if (!res.ok) return;
    const photos = photoRes.ok && Array.isArray(photoJson.photos) ? photoJson.photos : [];
    const photosByDay = photos.reduce((acc: Record<string, any[]>, photo: any) => {
      const day = String(photo.reportDate).slice(0, 10);
      acc[day] = acc[day] || [];
      acc[day].push(photo);
      return acc;
    }, {});
    const reports = (json.reports || []).map((row: any) => ({
      ...row,
      photos: photosByDay[String(row.reportDate).slice(0, 10)] || [],
    }));
    setReportRows((prev) => ({ ...prev, [type]: reports }));
  }, [task.id]);

  const ensureRowsLoaded = useCallback(async (type: ReportType) => {
    if ((reportRows[type] || []).length > 0) return;
    await loadReportRows(type);
  }, [loadReportRows, reportRows]);

  useEffect(() => {
    if (activeTab === "technical") void ensureRowsLoaded("technical");
    if (activeTab === "material") void ensureRowsLoaded("material");
    if (activeTab === "labor") void ensureRowsLoaded("labor");
    if (activeTab === "equipment") void ensureRowsLoaded("equipment");
  }, [activeTab, ensureRowsLoaded]);

  async function submitReport(type: ReportType) {
    const endpoint = reportTypeConfig[type].endpoint;
    const payload = payloads[type];
    const res = await fetch(`/api/tasks/${task.id}/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message || "Gửi báo cáo thất bại");

    const files = pickedFiles[type];
    if (files && files.length > 0) {
      const form = new FormData();
      form.append("reportType", type);
      form.append("reportDate", new Date().toISOString().slice(0, 10));
      if (type === "technical" && json.report?.id) form.append("technicalReportId", json.report.id);
      Array.from(files).forEach((f) => form.append("files", f));
      await fetch(`/api/tasks/${task.id}/report-photos`, { method: "POST", body: form });
      setPickedFiles((prev) => ({ ...prev, [type]: null }));
    }

    toast.success("Đã lưu báo cáo hôm nay");
    setPayloads((prev) => ({
      ...prev,
      [type]:
        type === "technical"
          ? { status: "working", progress: 0, progressSaved: false, assessment: "", assessmentNote: "", lesson: "" }
          : type === "material"
            ? { hasIssue: false, issueDescription: "", note: "" }
            : type === "labor"
              ? { masterWorkerCount: null, helperCount: null, note: "" }
              : { note: "" },
    }));
    await loadReportRows(type);
  }

  async function saveTechnicalStatusToday() {
    const payload = payloads.technical;
    setSavingTechnicalStatus(true);
    const res = await fetch(`/api/tasks/${task.id}/technical-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: payload.status || "working" }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingTechnicalStatus(false);
    if (!res.ok) return toast.error(json.message || "Cập nhật trạng thái thất bại");
    toast.success("Đã cập nhật trạng thái hôm nay");
    await loadReportRows("technical");
  }

  async function createGuidedTechnicalReport(additional = false) {
    const payload = payloads.technical;
    if (!payload.progressSaved) return toast.error("Vui lòng lưu tiến độ trước");
    if (!payload.assessment) return toast.error("Vui lòng chọn đánh giá kỹ thuật");
    if (payload.assessment === "failed" && !String(payload.assessmentNote || "").trim()) return toast.error("Chưa đạt bắt buộc nêu rõ lý do");

    const entry = {
      progressToday: Number(payload.progress) || 0,
      assessment: payload.assessment,
      assessmentText: payload.assessment === "passed" ? "Đã giám sát thi công đúng biện pháp thi công và đạt yêu cầu kỹ thuật" : "Chưa đạt",
      assessmentNote: String(payload.assessmentNote || "").trim() || null,
      lesson: String(payload.lesson || "").trim() || null,
      createdAt: new Date().toISOString(),
      additional,
    };

    const res = await fetch(`/api/tasks/${task.id}/technical-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: technicalToday?.status || payload.status || "working",
        technicalIssue: payload.assessment === "failed" ? payload.assessmentNote : null,
        note: buildTechnicalNote(technicalToday, entry),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message || "Tạo báo cáo thất bại");

    const files = pickedFiles.technical;
    if (files && files.length > 0) {
      const form = new FormData();
      form.append("reportType", "technical");
      form.append("reportDate", getTodayDateText());
      if (json.report?.id) form.append("technicalReportId", json.report.id);
      Array.from(files).forEach((f) => form.append("files", f));
      await fetch(`/api/tasks/${task.id}/report-photos`, { method: "POST", body: form });
      setPickedFiles((prev) => ({ ...prev, technical: null }));
    }

    toast.success(additional ? "Đã cập nhật thêm báo cáo" : "Đã tạo báo cáo kỹ thuật");
    setPayloads((prev) => ({ ...prev, technical: { status: technicalToday?.status || "working", progress: 0, progressSaved: false, assessment: "", assessmentNote: "", lesson: "" } }));
    setTechnicalReportOpen(false);
    setTechnicalReportStep(1);
    setTechnicalSubTab("today");
    await loadReportRows("technical");
  }

  function canDeleteReportPhoto(photo: any) {
    return currentUserRole === "admin" || currentUserRole === "construction_manager" || photo.uploadedBy === currentUserId;
  }

  async function deleteReportPhoto(type: ReportType, photoId: string) {
    setDeletingReportPhotoId(photoId);
    try {
      const res = await fetch(`/api/tasks/${task.id}/report-photos/${photoId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({} as { message?: string }));
      if (!res.ok) {
        throw new Error(json.message || "Xóa ảnh thất bại");
      }
      toast.success(json.message || "Đã xóa ảnh");
      await loadReportRows(type);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Xóa ảnh thất bại");
    } finally {
      setDeletingReportPhotoId(null);
    }
  }

  function renderReportPhotos(row: any, type: ReportType) {
    const photos = Array.isArray(row.photos) ? row.photos : [];
    if (!photos.length) return null;

    return (
      <div className="mt-2 space-y-2">
        <div className="text-xs font-semibold text-[#c8d0e8]">Ảnh đính kèm ({photos.length})</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {photos.map((photo: any, index: number) => (
            <div key={photo.id || `${row.id}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-[#343a50] bg-[#1a1d27] p-2 text-xs">
              <a href={`/api/tasks/${task.id}/report-photos/${photo.id}/file`} target="_blank" rel="noreferrer" className="text-amber-300 underline">
                Xem ảnh #{index + 1}
              </a>
              {canDeleteReportPhoto(photo) ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-7 border-red-500/40 bg-red-500/10 px-2 text-[11px] text-red-200"
                  disabled={deletingReportPhotoId === photo.id}
                  onClick={() => deleteReportPhoto(type, photo.id)}
                >
                  {deletingReportPhotoId === photo.id ? "Đang xóa" : "Xóa"}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderTechnicalTodayFlow() {
    const payload = payloads.technical;
    const isAdditional = technicalHasGuidedReport;
    return (
      <div className="space-y-3">
        {!technicalToday ? (
          <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Cập nhật trạng thái hôm nay</div>
            <select className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={payload.status || "working"} onChange={(e) => setPayloads((p) => ({ ...p, technical: { ...p.technical, status: e.target.value } }))}>
              <option value="working">Đang làm</option>
              <option value="paused">Tạm dừng</option>
              <option value="completed">Hoàn thành</option>
            </select>
            <Button disabled={savingTechnicalStatus} className="w-full bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={saveTechnicalStatusToday}>Lưu</Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Trạng thái hôm nay</div>
                <div className="mt-1 text-sm font-semibold text-amber-300">{statusLabel(technicalToday.status)}</div>
              </div>
              {!technicalReportOpen ? <Button className="bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={() => { setTechnicalReportStep(1); setTechnicalReportOpen(true); }}>{isAdditional ? "Cập nhật thêm báo cáo" : "Báo cáo kỹ thuật hôm nay"}</Button> : null}
            </div>
          </div>
        )}

        {technicalReportOpen ? (
          <div className="rounded-2xl border border-amber-500/50 bg-[#1a1d27] p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-amber-300">{isAdditional ? "Cập nhật thêm báo cáo" : "Báo cáo kỹ thuật hôm nay"}</div>
              <div className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">Bước {technicalReportStep}/4</div>
            </div>

            {technicalReportStep === 1 ? (
              <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3 space-y-3">
                <div className="flex items-center justify-between text-sm"><span className="font-semibold">Tiến độ hôm nay</span><b>{Number(payload.progress) || 0}%</b></div>
                <input type="range" min="0" max="100" className="w-full" value={payload.progress || 0} onChange={(e) => setPayloads((p) => ({ ...p, technical: { ...p.technical, progress: Number(e.target.value), progressSaved: false } }))} />
                <Button className="w-full bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={() => {
                  setPayloads((p) => ({ ...p, technical: { ...p.technical, progressSaved: true } }));
                  setTechnicalReportStep(2);
                }}>Tiếp tục</Button>
              </div>
            ) : null}

            {technicalReportStep === 2 ? (
              <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3 space-y-3">
                <div className="text-sm font-semibold">Đánh giá kỹ thuật</div>
                <label className="block text-sm"><input type="radio" name="technical-assessment" className="mr-2" checked={payload.assessment === "passed"} onChange={() => setPayloads((p) => ({ ...p, technical: { ...p.technical, assessment: "passed" } }))} />Đã giám sát thi công đúng biện pháp thi công và đạt yêu cầu kỹ thuật</label>
                <label className="block text-sm"><input type="radio" name="technical-assessment" className="mr-2" checked={payload.assessment === "failed"} onChange={() => setPayloads((p) => ({ ...p, technical: { ...p.technical, assessment: "failed" } }))} />Chưa đạt</label>
                <textarea className="w-full rounded-xl border border-[#2e3347] bg-[#1a1d27] px-3 py-2" rows={3} placeholder={payload.assessment === "failed" ? "Bắt buộc nêu rõ lý do chưa đạt" : "Ghi chú đánh giá (nếu có)"} value={payload.assessmentNote || ""} onChange={(e) => setPayloads((p) => ({ ...p, technical: { ...p.technical, assessmentNote: e.target.value } }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="border-[#2e3347] bg-[#1a1d27]" onClick={() => setTechnicalReportStep(1)}>Quay lại</Button>
                  <Button className="bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={() => {
                    if (!payload.assessment) return toast.error("Vui lòng chọn đánh giá kỹ thuật");
                    if (payload.assessment === "failed" && !String(payload.assessmentNote || "").trim()) return toast.error("Chưa đạt bắt buộc nêu rõ lý do");
                    setTechnicalReportStep(3);
                  }}>Tiếp tục</Button>
                </div>
              </div>
            ) : null}

            {technicalReportStep === 3 ? (
              <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3 space-y-3">
                <div className="text-sm font-semibold">Đính kèm hình ảnh chi tiết</div>
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-xs" onChange={(e) => setPickedFiles((prev) => ({ ...prev, technical: e.target.files }))} />
                <div className="text-[11px] text-amber-300/80">
                  Bắt buộc chụp tại hiện trường. Ảnh cũ &gt; 30 phút hoặc ảnh đã upload trước đó sẽ bị từ chối.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="border-[#2e3347] bg-[#1a1d27]" onClick={() => setTechnicalReportStep(2)}>Quay lại</Button>
                  <Button className="bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={() => setTechnicalReportStep(4)}>Tiếp tục</Button>
                </div>
              </div>
            ) : null}

            {technicalReportStep === 4 ? (
              <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3 space-y-3">
                <div className="text-sm font-semibold">Kinh nghiệm lưu lại cho lần sau</div>
                <textarea className="w-full rounded-xl border border-[#2e3347] bg-[#1a1d27] px-3 py-2" rows={3} placeholder="Kinh nghiệm / lưu ý kỹ thuật" value={payload.lesson || ""} onChange={(e) => setPayloads((p) => ({ ...p, technical: { ...p.technical, lesson: e.target.value } }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="border-[#2e3347] bg-[#1a1d27]" onClick={() => setTechnicalReportStep(3)}>Quay lại</Button>
                  <Button className="bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={() => createGuidedTechnicalReport(isAdditional)}>Tạo báo cáo</Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {renderHistory("technical")}
      </div>
    );
  }

  function renderReportForm(type: ReportType) {
    const payload = payloads[type];
    return (
      <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-2">
        <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Báo cáo hôm nay · {reportTypeConfig[type].label}</div>

        {type === "technical" ? (
          <select className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={payload.status || "working"} onChange={(e) => setPayloads((p) => ({ ...p, technical: { ...p.technical, status: e.target.value } }))}>
            <option value="working">Đang làm</option>
            <option value="paused">Tạm dừng</option>
            <option value="completed">Hoàn thành</option>
          </select>
        ) : null}

        {type === "material" ? (
          <>
            <label className="text-sm"><input type="checkbox" className="mr-2" checked={Boolean(payload.hasIssue)} onChange={(e) => setPayloads((p) => ({ ...p, material: { ...p.material, hasIssue: e.target.checked } }))} />Có vướng mắc vật tư</label>
            <textarea className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" rows={2} placeholder="Mô tả vướng mắc" value={payload.issueDescription || ""} onChange={(e) => setPayloads((p) => ({ ...p, material: { ...p.material, issueDescription: e.target.value } }))} />
          </>
        ) : null}

        {type === "labor" ? (
          <div className="grid grid-cols-2 gap-2">
            <input type="number" className="rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" placeholder="Thợ chính" value={payload.masterWorkerCount || ""} onChange={(e) => setPayloads((p) => ({ ...p, labor: { ...p.labor, masterWorkerCount: Number(e.target.value) || null } }))} />
            <input type="number" className="rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" placeholder="Thợ phụ" value={payload.helperCount || ""} onChange={(e) => setPayloads((p) => ({ ...p, labor: { ...p.labor, helperCount: Number(e.target.value) || null } }))} />
          </div>
        ) : null}

        <textarea className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" rows={3} placeholder="Ghi chú" value={payload.note || ""} onChange={(e) => setPayloads((p) => ({ ...p, [type]: { ...p[type], note: e.target.value } }))} />
        <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-xs" onChange={(e) => setPickedFiles((prev) => ({ ...prev, [type]: e.target.files }))} />
        <div className="text-[11px] text-amber-300/80">
          Bắt buộc chụp tại hiện trường. Ảnh cũ &gt; 30 phút hoặc ảnh đã upload trước đó sẽ bị từ chối.
        </div>
        <Button className="bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={() => submitReport(type)}>Lưu báo cáo</Button>
      </div>
    );
  }

  function renderHistory(type: ReportType) {
    const rows = type === "technical" ? technicalHistory : type === "material" ? materialHistory : type === "labor" ? laborHistory : equipmentHistory;
    if (type === "technical") {
      const days = Object.keys(technicalHistoryGroups).sort((a, b) => +new Date(b) - +new Date(a));
      return (
        <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Lịch sử báo cáo · Kỹ thuật</div>
          {days.length === 0 ? <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-4 text-sm text-[#8891aa]">Chưa có dữ liệu</div> : (
            <div className="space-y-3">{days.map((day) => (
              <div key={day} className="rounded-xl border border-[#2e3347] bg-[#222637] p-3 text-sm">
                <div className="font-semibold text-amber-300">{fmtDate(day)}</div>
                <div className="mt-2 space-y-3">{technicalHistoryGroups[day].map((row: any) => {
                  const meta = parseTechnicalMeta(row);
                  return (
                    <div key={row.id} className="rounded-lg border border-[#343a50] bg-[#1a1d27] p-3">
                      <div className="text-xs text-[#8891aa]">Trạng thái: <span className="font-semibold text-[#f0f2f8]">{statusLabel(row.status)}</span></div>
                      {meta.entries.length === 0 ? <div className="mt-2 text-xs text-[#8891aa]">Đã cập nhật trạng thái, chưa tạo báo cáo kỹ thuật chi tiết.</div> : null}
                      {meta.entries.map((entry: any, idx: number) => (
                        <div key={`${row.id}-${idx}`} className="mt-2 rounded-lg bg-[#222637] p-2 text-xs text-[#c8d0e8]">
                          <div className="font-semibold text-[#f0f2f8]">{entry.additional ? "Báo cáo bổ sung" : "Báo cáo kỹ thuật"} #{idx + 1}</div>
                          <div>Tiến độ hôm nay: {entry.progressToday ?? 0}%</div>
                          <div>Đánh giá: {entry.assessmentText || (entry.assessment === "passed" ? "Đạt yêu cầu" : "Chưa đạt")}</div>
                          {entry.assessmentNote ? <div>Ghi chú/Lý do: {entry.assessmentNote}</div> : null}
                          {entry.lesson ? <div>Kinh nghiệm: {entry.lesson}</div> : null}
                        </div>
                      ))}
                      {renderReportPhotos(row, "technical")}
                    </div>
                  );
                })}</div>
              </div>
            ))}</div>
          )}
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Lịch sử · {reportTypeConfig[type].label}</div>
        {rows.length === 0 ? <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-4 text-sm text-[#8891aa]">Chưa có dữ liệu</div> : (
          <div className="space-y-2">
            {rows.map((row: any) => (
              <div key={row.id} className="rounded-xl border border-[#2e3347] bg-[#222637] p-3 text-sm">
                <div className="font-semibold">{fmtDate(row.reportDate)}</div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-[#c8d0e8]">{JSON.stringify(row, null, 2)}</pre>
                {renderReportPhotos(row, type)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0f1117] text-[#f0f2f8]">
      <div className="sticky top-0 z-40 border-b border-[#2e3347] bg-[#0f1117] px-4 pb-0 pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            className="rounded-full border border-[#2e3347] bg-[#1a1d27] px-3 py-1.5 text-xs font-semibold text-[#c8d0e8] transition hover:border-amber-500/60 hover:text-amber-300"
          >
            ← Quay lại
          </button>
          <div className="text-3xl font-extrabold leading-none text-amber-500">{task.code}</div>
          <span className="rounded-full bg-sky-500/15 px-2 py-1 text-[11px] font-semibold text-sky-300">{PHASE_LABEL[task.phase]}</span>
          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
        </div>
        <div className="mb-2 text-base font-bold">{task.name}</div>

        <div className="mt-3 flex overflow-x-auto border-b border-[#2e3347] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => (
            <button key={tab.key} className={`flex h-12 flex-shrink-0 items-center whitespace-nowrap border-b-2 px-4 text-xs font-semibold transition ${activeTab === tab.key ? "border-amber-500 text-amber-500" : "border-transparent text-[#8891aa]"}`} onClick={async () => {
              setActiveTab(tab.key);
              if (tab.key === "technical") await ensureRowsLoaded("technical");
              if (tab.key === "material") await ensureRowsLoaded("material");
              if (tab.key === "labor") await ensureRowsLoaded("labor");
              if (tab.key === "equipment") await ensureRowsLoaded("equipment");
            }}>{tab.label}</button>
          ))}
        </div>


        {(["material", "labor", "equipment"] as MainTab[]).includes(activeTab) ? (
          <div className="flex gap-2 overflow-x-auto py-2">
            {[
              { key: "today", label: "Báo cáo hôm nay" },
              { key: "history", label: "Lịch sử" },
              { key: "planning", label: "Dự toán/Đề xuất" },
            ].map((item) => {
              const active = activeTab === "material" ? materialSubTab : activeTab === "labor" ? laborSubTab : equipmentSubTab;
              return <button key={item.key} onClick={() => {
                if (activeTab === "material") setMaterialSubTab(item.key as ResourceSubTab);
                if (activeTab === "labor") setLaborSubTab(item.key as ResourceSubTab);
                if (activeTab === "equipment") setEquipmentSubTab(item.key as ResourceSubTab);
              }} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${active === item.key ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] text-[#8891aa]"}`}>{item.label}</button>;
            })}
          </div>
        ) : null}

        {activeTab === "journal" ? (
          <div className="flex gap-2 overflow-x-auto py-2">
            {[
              { key: "all", label: "Tất cả" },
              { key: "photos", label: "Ảnh" },
              { key: "qc", label: "QC" },
              { key: "issues", label: "Phát sinh" },
            ].map((item) => (
              <button key={item.key} onClick={() => setJournalSubTab(item.key as JournalSubTab)} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${journalSubTab === item.key ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] text-[#8891aa]"}`}>{item.label}</button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={activeTab === "progress" ? "flex min-h-0 flex-1 flex-col p-4" : "space-y-3 p-4"}>
        {activeTab === "overview" ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Kế hoạch</div>
              <div className="grid grid-cols-2 gap-2 text-sm"><div>BĐ KH: {fmtDate(task.plannedStartDate)}</div><div>KT KH: {fmtDate(task.plannedEndDate)}</div><div>BĐ TT: {fmtDate(task.actualStartDate)}</div><div>KT TT: {fmtDate(task.actualEndDate)}</div></div>
            </div>
            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Phân công</div>
              <div className="text-sm">KS: {task.assignedEngineer?.fullName || "-"} · Đội trưởng: {task.assignedForeman?.fullName || "-"}</div>
            </div>

            {canEditDates ? (
              <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Sửa nhanh</div>
                <div className="grid grid-cols-2 gap-2"><input type="date" className="rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} /><input type="date" className="rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} /><input type="date" className="rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={actualStart} onChange={(e) => setActualStart(e.target.value)} /><input type="date" className="rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} /></div>
                <Button variant="outline" className="border-[#2e3347] bg-[#222637]" onClick={() => patchTask("dates", { plannedStartDate: plannedStart || null, plannedEndDate: plannedEnd || null, actualStartDate: actualStart || null, actualEndDate: actualEnd || null })}>Lưu ngày</Button>
              </div>
            ) : null}

            {canAssign ? (
              <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Cập nhật phân công</div>
                <input className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" placeholder="Đội" value={team} onChange={(e) => setTeam(e.target.value)} />
                <select className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={assignedEngineerId} onChange={(e) => setAssignedEngineerId(e.target.value)}><option value="">KS phụ trách</option>{engineers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select>
                <select className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={assignedForemanId} onChange={(e) => setAssignedForemanId(e.target.value)}><option value="">Đội trưởng</option>{foremen.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select>
                <input className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" placeholder="Người nghiệm thu" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
                <label className="text-sm"><input type="checkbox" checked={visibleToCustomer} onChange={(e) => setVisibleToCustomer(e.target.checked)} className="mr-2" />Hiển thị cổng chủ nhà</label>
                <Button className="bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={() => patchTask("assignment", { assignedEngineerId: assignedEngineerId || null, assignedForemanId: assignedForemanId || null, team, inspectorName })}>Lưu phân công</Button>
                <Button variant="outline" className="border-[#2e3347] bg-[#222637]" onClick={() => patchTask("customer_visibility", { visibleToCustomer })}>Lưu cổng chủ nhà</Button>
              </div>
            ) : null}

            <TaskStatusFlow
              taskId={task.id}
              status={status}
              category={task.category}
              currentUserRole={currentUserRole}
              canUpdateQc={canUpdateQc}
              onStatusChanged={(nextStatus) => setStatus(nextStatus)}
            />
          </div>
        ) : null}

        {activeTab === "progress" ? (
          <TaskProgressSection taskId={task.id} canUpdate={canUpdateQc} />
        ) : null}

        {activeTab === "technical" ? <QcSection taskId={task.id} canUpdateQc={canUpdateQc} canManageItem={canManageQcItem} /> : null}

        {activeTab === "material" ? (
          <>
            <MaterialSection taskId={task.id} canUpdateQc={canUpdateQc} canManageItem={canManageQcItem} />
            {materialSubTab === "today" ? renderReportForm("material") : null}
            {materialSubTab === "history" ? renderHistory("material") : null}
            {materialSubTab === "planning" ? <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 text-sm">Dự toán/Đề xuất vật tư (placeholder theo spec).</div> : null}
            {materialSubTab === "today" && materialToday ? <div className="rounded-xl border border-[#2e3347] bg-[#1a1d27] p-3 text-xs text-[#8891aa]">Đã có báo cáo hôm nay ({fmtDate(materialToday.reportDate)}).</div> : null}
          </>
        ) : null}

        {activeTab === "labor" ? (
          <>
            {laborSubTab === "today" ? renderReportForm("labor") : null}
            {laborSubTab === "history" ? renderHistory("labor") : null}
            {laborSubTab === "planning" ? <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 text-sm">Dự toán/Đề xuất nhân công (placeholder theo spec).</div> : null}
            {laborSubTab === "today" && laborToday ? <div className="rounded-xl border border-[#2e3347] bg-[#1a1d27] p-3 text-xs text-[#8891aa]">Đã có báo cáo hôm nay ({fmtDate(laborToday.reportDate)}).</div> : null}
          </>
        ) : null}

        {activeTab === "equipment" ? (
          <>
            {equipmentSubTab === "today" ? renderReportForm("equipment") : null}
            {equipmentSubTab === "history" ? renderHistory("equipment") : null}
            {equipmentSubTab === "planning" ? <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 text-sm">Dự toán/Đề xuất máy móc (placeholder theo spec).</div> : null}
            {equipmentSubTab === "today" && equipmentToday ? <div className="rounded-xl border border-[#2e3347] bg-[#1a1d27] p-3 text-xs text-[#8891aa]">Đã có báo cáo hôm nay ({fmtDate(equipmentToday.reportDate)}).</div> : null}
          </>
        ) : null}

        {activeTab === "subcontractor" ? (
          <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 text-sm">Module thầu phụ: giữ tương thích hệ thống hiện hữu, không thay đổi API/module riêng. Vùng này là placeholder theo spec tab chính.</div>
        ) : null}

        {activeTab === "journal" ? (
          <>
            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Nhật ký task</div>
              {filteredLogs.length === 0 ? <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-4 text-sm text-[#8891aa]">Không có bản ghi phù hợp.</div> : (
                <div className="space-y-2">{filteredLogs.slice(0, 40).map((log) => <div key={log.id} className="rounded-xl border border-[#2e3347] bg-[#222637] p-2 text-xs"><div className="font-semibold">{log.content}</div><div className="text-[#8891aa]">{new Date(log.createdAt).toLocaleString("vi-VN")} · {log.user?.fullName || log.user?.email || "-"}</div></div>)}</div>
              )}
            </div>
            {journalSubTab === "all" ? <JournalSection taskId={task.id} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
