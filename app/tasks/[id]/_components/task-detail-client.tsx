"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PHASE_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/lib/task-display";
import { QcSection } from "./qc-section";
import { MaterialSection } from "./material-section";
import { JournalSection } from "./journal-section";

type TaskDetail = {
  id: string;
  code: string;
  phase: keyof typeof PHASE_LABEL;
  name: string;
  isMilestone: boolean;
  visibleToCustomer?: boolean;
  status: "not_started" | "in_progress" | "done" | "inspected" | "delayed" | "na";
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

type MainTab = "overview" | "technical" | "material" | "labor" | "equipment" | "subcontractor" | "journal";
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

function parseMainTab(input: string | null): MainTab {
  const value = (input || "").toLowerCase();
  if (["overview", "technical", "material", "labor", "equipment", "subcontractor", "journal"].includes(value)) return value as MainTab;
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
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const initialLegacySub = parseLegacySub(params.get("subTab"));
  const initialMain = parseMainTab(params.get("tab")) === "technical" && params.get("tab") === "reports" ? detectMainFromReportType(initialLegacySub) : parseMainTab(params.get("tab"));

  const [task] = useState<TaskDetail>(initialTask);
  const [logs] = useState<TaskLog[]>(initialLogs);
  const [activeTab, setActiveTab] = useState<MainTab>(initialMain);
  const [technicalSubTab, setTechnicalSubTab] = useState<TechnicalSubTab>(params.get("tab") === "history" ? "history" : "today");
  const [materialSubTab, setMaterialSubTab] = useState<ResourceSubTab>(params.get("tab") === "history" && initialLegacySub === "material" ? "history" : "today");
  const [laborSubTab, setLaborSubTab] = useState<ResourceSubTab>(params.get("tab") === "history" && initialLegacySub === "labor" ? "history" : "today");
  const [equipmentSubTab, setEquipmentSubTab] = useState<ResourceSubTab>(params.get("tab") === "history" && initialLegacySub === "equipment" ? "history" : "today");
  const [journalSubTab, setJournalSubTab] = useState<JournalSubTab>("all");

  const [reportRows, setReportRows] = useState<Record<ReportType, any[]>>({ technical: [], material: [], labor: [], equipment: [] });
  const [payloads, setPayloads] = useState<Record<ReportType, Record<string, any>>>({
    technical: { status: "working", note: "" },
    material: { hasIssue: false, issueDescription: "", note: "" },
    labor: { masterWorkerCount: null, helperCount: null, note: "" },
    equipment: { note: "" },
  });
  const [pickedFiles, setPickedFiles] = useState<Record<ReportType, FileList | null>>({ technical: null, material: null, labor: null, equipment: null });

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

  const tabs: { key: MainTab; label: string }[] = [
    { key: "overview", label: "Tổng quan" },
    { key: "technical", label: "Kỹ thuật" },
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
    toast.success(json.message || "Đã cập nhật");
  }

  async function loadReportRows(type: ReportType) {
    const endpoint = reportTypeConfig[type].endpoint;
    const res = await fetch(`/api/tasks/${task.id}/${endpoint}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setReportRows((prev) => ({ ...prev, [type]: json.reports || [] }));
  }

  async function ensureRowsLoaded(type: ReportType) {
    if ((reportRows[type] || []).length > 0) return;
    await loadReportRows(type);
  }

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
          ? { status: "working", note: "" }
          : type === "material"
            ? { hasIssue: false, issueDescription: "", note: "" }
            : type === "labor"
              ? { masterWorkerCount: null, helperCount: null, note: "" }
              : { note: "" },
    }));
    await loadReportRows(type);
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
        <Button className="bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={() => submitReport(type)}>Lưu báo cáo</Button>
      </div>
    );
  }

  function renderHistory(type: ReportType) {
    const rows = type === "technical" ? technicalHistory : type === "material" ? materialHistory : type === "labor" ? laborHistory : equipmentHistory;
    return (
      <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Lịch sử · {reportTypeConfig[type].label}</div>
        {rows.length === 0 ? <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-4 text-sm text-[#8891aa]">Chưa có dữ liệu</div> : (
          <div className="space-y-2">{rows.map((row: any) => <div key={row.id} className="rounded-xl border border-[#2e3347] bg-[#222637] p-3 text-sm"><div className="font-semibold">{fmtDate(row.reportDate)}</div><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-[#c8d0e8]">{JSON.stringify(row, null, 2)}</pre></div>)}</div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-[#f0f2f8]">
      <div className="sticky top-0 z-40 border-b border-[#2e3347] bg-[#0f1117] px-4 pb-0 pt-1">
        <div className="mt-1 flex overflow-x-auto border-b border-[#2e3347] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

        {activeTab === "technical" ? (
          <div className="flex gap-2 overflow-x-auto py-2">
            {[
              { key: "requirements", label: "YC kỹ thuật" },
              { key: "method", label: "Biện pháp TC" },
              { key: "drawings", label: "Bản vẽ" },
              { key: "qc", label: "QC checklist" },
              { key: "today", label: "Báo cáo hôm nay" },
              { key: "history", label: "Lịch sử" },
            ].map((item) => (
              <button key={item.key} onClick={() => setTechnicalSubTab(item.key as TechnicalSubTab)} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${technicalSubTab === item.key ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] text-[#8891aa]"}`}>{item.label}</button>
            ))}
          </div>
        ) : null}

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

      <div className="space-y-3 p-4">
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

            {canChangeStatus ? (
              <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Trạng thái</div>
                <div className="grid grid-cols-2 gap-2">{(Object.keys(STATUS_LABEL) as TaskDetail["status"][]).map((k) => <button key={k} className={`rounded-xl border px-3 py-2 text-xs ${status === k ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] bg-[#222637] text-[#8891aa]"}`} onClick={() => setStatus(k)}>{STATUS_LABEL[k]}</button>)}</div>
                <Button className="mt-3 w-full bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={() => patchTask("status", { status })}>Cập nhật trạng thái</Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "technical" ? (
          <>
            {technicalSubTab === "requirements" ? <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 text-sm">Yêu cầu kỹ thuật được kế thừa từ template & hồ sơ task. Bổ sung module nhập chi tiết theo spec ở phase sau.</div> : null}
            {technicalSubTab === "method" ? <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 text-sm">Biện pháp thi công: placeholder theo spec (đã chừa slot để tích hợp form/duyệt).</div> : null}
            {technicalSubTab === "drawings" ? <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 text-sm">Bản vẽ: placeholder theo spec (đã sẵn vị trí đính kèm file/bản vẽ).</div> : null}
            {technicalSubTab === "qc" ? <QcSection taskId={task.id} canUpdateQc={canUpdateQc} canManageItem={canManageQcItem} /> : null}
            {technicalSubTab === "today" ? renderReportForm("technical") : null}
            {technicalSubTab === "history" ? renderHistory("technical") : null}
          </>
        ) : null}

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
