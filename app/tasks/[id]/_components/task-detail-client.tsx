"use client";

import { useEffect, useMemo, useState } from "react";
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

function toInputDate(dateIso: string | null) {
  if (!dateIso) return "";
  return dateIso.slice(0, 10);
}

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

const reportTypeConfig = {
  technical: { label: "Kỹ thuật", endpoint: "technical-reports", fields: ["status", "pauseReason", "technicalIssue", "note"] },
  material: { label: "Vật tư", endpoint: "material-reports", fields: ["hasIssue", "issueDescription", "note"] },
  labor: { label: "Nhân công", endpoint: "labor-reports", fields: ["masterWorkerCount", "helperCount", "note"] },
  equipment: { label: "Thiết bị", endpoint: "equipment-reports", fields: ["note"] },
} as const;

type ReportType = keyof typeof reportTypeConfig;

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
  const [task, setTask] = useState<TaskDetail>(initialTask);
  const [logs, setLogs] = useState<TaskLog[]>(initialLogs);
  const getInitialTab = () => {
    if (typeof window === "undefined") return "overview" as const;
    const tab = new URLSearchParams(window.location.search).get("tab");
    return (["overview", "qc", "material", "reports", "history", "journal", "status"] as const).includes(tab as any) ? (tab as any) : "overview";
  };
  const getInitialSub = () => {
    if (typeof window === "undefined") return "technical" as ReportType;
    const sub = new URLSearchParams(window.location.search).get("subTab");
    return (["technical", "material", "labor", "equipment"] as const).includes(sub as any) ? (sub as ReportType) : "technical";
  };
  const [activeTab, setActiveTab] = useState<"overview" | "qc" | "material" | "reports" | "history" | "journal" | "status">(getInitialTab);
  const [reportType, setReportType] = useState<ReportType>(getInitialSub);
  const [historyType, setHistoryType] = useState<ReportType>(getInitialSub);
  const [reportRows, setReportRows] = useState<Record<ReportType, any[]>>({ technical: [], material: [], labor: [], equipment: [] });
  const [payload, setPayload] = useState<Record<string, any>>({ status: "working", note: "" });
  const [pickedFiles, setPickedFiles] = useState<FileList | null>(null);

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

  const tabs = [
    { key: "overview", label: "Tổng quan" },
    { key: "qc", label: "QC" },
    { key: "material", label: "Vật tư" },
    { key: "reports", label: "Báo cáo" },
    { key: "history", label: "Lịch sử" },
    { key: "journal", label: "Timeline" },
    ...(canChangeStatus ? [{ key: "status", label: "Trạng thái" }] : []),
  ] as const;

  async function patchTask(section: string, body: object) {
    const res = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, payload: body }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message || "Cập nhật thất bại");
    if (json.task) setTask((prev) => ({ ...prev, ...json.task }));
    toast.success(json.message || "Đã cập nhật");
  }

  async function loadReportRows(type: ReportType) {
    const endpoint = reportTypeConfig[type].endpoint;
    const res = await fetch(`/api/tasks/${task.id}/${endpoint}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setReportRows((prev) => ({ ...prev, [type]: json.reports || [] }));
  }

  useEffect(() => {
    loadReportRows(reportType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, task.id]);

  const sortedHistory = useMemo(() => [...(reportRows[historyType] || [])].sort((a, b) => +new Date(b.reportDate) - +new Date(a.reportDate)), [historyType, reportRows]);

  async function submitReport() {
    const endpoint = reportTypeConfig[reportType].endpoint;
    const res = await fetch(`/api/tasks/${task.id}/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message || "Gửi báo cáo thất bại");

    if (pickedFiles && pickedFiles.length > 0) {
      const form = new FormData();
      form.append("reportType", reportType);
      form.append("reportDate", new Date().toISOString().slice(0, 10));
      if (reportType === "technical" && json.report?.id) form.append("technicalReportId", json.report.id);
      Array.from(pickedFiles).forEach((f) => form.append("files", f));
      await fetch(`/api/tasks/${task.id}/report-photos`, { method: "POST", body: form });
      setPickedFiles(null);
    }

    toast.success("Đã lưu báo cáo");
    setPayload({ status: "working", note: "" });
    loadReportRows(reportType);
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-[#f0f2f8]">
      <div className="sticky top-0 z-40 border-b border-[#2e3347] bg-[#0f1117] px-4 pb-0 pt-3">
        <div className="mb-2 flex items-center gap-2"><button className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#2e3347] bg-[#1a1d27]" onClick={() => window.history.back()}>←</button><div className="truncate text-xs text-[#8891aa]">{task.project.code} › Task {task.code}</div></div>
        <div className="mb-2 flex flex-wrap items-center gap-2"><div className="text-3xl font-extrabold leading-none text-amber-500">{task.code}</div><span className="rounded-full bg-sky-500/15 px-2 py-1 text-[11px] font-semibold text-sky-300">{PHASE_LABEL[task.phase]}</span><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span></div>
        <div className="mb-2 text-base font-bold">{task.name}</div>

        <div className="mt-3 flex overflow-x-auto border-b border-[#2e3347]">
          {tabs.map((tab) => (
            <button key={tab.key} className={`flex h-12 flex-shrink-0 items-center whitespace-nowrap border-b-2 px-4 text-xs font-semibold ${activeTab === tab.key ? "border-amber-500 text-amber-500" : "border-transparent text-[#8891aa]"}`} onClick={() => setActiveTab(tab.key as any)}>{tab.label}</button>
          ))}
        </div>

        {(activeTab === "reports" || activeTab === "history") ? (
          <div className="flex gap-2 overflow-x-auto py-2">
            {(Object.keys(reportTypeConfig) as ReportType[]).map((k) => (
              <button key={k} onClick={() => activeTab === "reports" ? setReportType(k) : setHistoryType(k)} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${(activeTab === "reports" ? reportType : historyType) === k ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] text-[#8891aa]"}`}>{reportTypeConfig[k].label}</button>
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
          </div>
        ) : null}

        {activeTab === "qc" ? <QcSection taskId={task.id} canUpdateQc={canUpdateQc} canManageItem={canManageQcItem} /> : null}
        {activeTab === "material" ? <MaterialSection taskId={task.id} canUpdateQc={canUpdateQc} canManageItem={canManageQcItem} /> : null}

        {activeTab === "reports" ? (
          <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Nộp báo cáo {reportTypeConfig[reportType].label}</div>
            {reportType === "technical" ? <select className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={payload.status || "working"} onChange={(e) => setPayload((p) => ({ ...p, status: e.target.value }))}><option value="working">Đang làm</option><option value="paused">Tạm dừng</option><option value="completed">Hoàn thành</option></select> : null}
            {reportType === "material" ? <label className="text-sm"><input type="checkbox" className="mr-2" checked={Boolean(payload.hasIssue)} onChange={(e) => setPayload((p) => ({ ...p, hasIssue: e.target.checked }))} />Có vướng mắc vật tư</label> : null}
            {reportType === "labor" ? <div className="grid grid-cols-2 gap-2"><input type="number" className="rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" placeholder="Thợ chính" value={payload.masterWorkerCount || ""} onChange={(e) => setPayload((p) => ({ ...p, masterWorkerCount: Number(e.target.value) || null }))} /><input type="number" className="rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" placeholder="Thợ phụ" value={payload.helperCount || ""} onChange={(e) => setPayload((p) => ({ ...p, helperCount: Number(e.target.value) || null }))} /></div> : null}
            <textarea className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" rows={3} placeholder="Ghi chú" value={payload.note || ""} onChange={(e) => setPayload((p) => ({ ...p, note: e.target.value }))} />
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-xs" onChange={(e) => setPickedFiles(e.target.files)} />
            <Button className="bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={submitReport}>Lưu báo cáo</Button>
          </div>
        ) : null}

        {activeTab === "history" ? (
          <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Lịch sử {reportTypeConfig[historyType].label}</div>
            {sortedHistory.length === 0 ? <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-4 text-sm text-[#8891aa]">Chưa có dữ liệu</div> : (
              <div className="space-y-2">{sortedHistory.map((row: any) => <div key={row.id} className="rounded-xl border border-[#2e3347] bg-[#222637] p-3 text-sm"><div className="font-semibold">{fmtDate(row.reportDate)}</div><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-[#c8d0e8]">{JSON.stringify(row, null, 2)}</pre></div>)}</div>
            )}
          </div>
        ) : null}

        {activeTab === "journal" ? <JournalSection taskId={task.id} /> : null}

        {activeTab === "status" ? (
          <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Chọn trạng thái</div>
            <div className="grid grid-cols-2 gap-2">{(Object.keys(STATUS_LABEL) as TaskDetail["status"][]).map((k) => <button key={k} className={`rounded-xl border px-3 py-2 text-xs ${status === k ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] bg-[#222637] text-[#8891aa]"}`} onClick={() => setStatus(k)}>{STATUS_LABEL[k]}</button>)}</div>
            {canChangeStatus ? <Button className="mt-3 w-full bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={() => patchTask("status", { status })}>Cập nhật trạng thái</Button> : null}
          </div>
        ) : null}

        <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Timeline hoạt động</div>
          <div className="space-y-2">{logs.slice(0, 30).map((log) => <div key={log.id} className="rounded-xl border border-[#2e3347] bg-[#222637] p-2 text-xs"><div className="font-semibold">{log.content}</div><div className="text-[#8891aa]">{new Date(log.createdAt).toLocaleString("vi-VN")} · {log.user?.fullName || log.user?.email || "-"}</div></div>)}</div>
        </div>
      </div>
    </div>
  );
}
