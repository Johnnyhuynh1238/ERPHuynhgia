"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/vi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PHASE_COLOR, PHASE_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/lib/task-display";
import { QcSection } from "./qc-section";
import { MaterialSection } from "./material-section";
import { JournalSection } from "./journal-section";

dayjs.extend(relativeTime);
dayjs.locale("vi");

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
  materialsNeeded: string;
  notes: string | null;
  qcChecklist: string;
  qcProgress: { checkedIndexes?: number[] } | null;
  project: {
    id: string;
    code: string;
    name: string;
    projectManagerId: string;
    mainEngineerId: string;
  };
  template: {
    proposerRole: string;
    ordererRole: string;
    receiverRole: string;
  };
  assignedEngineer: { id: string; fullName: string; email: string } | null;
  assignedForeman: { id: string; fullName: string; email: string } | null;
};

type TaskLog = {
  id: string;
  logType: "status_change" | "note" | "photo_uploaded" | "assignment_change" | "report_edit" | "reminder_sent";
  oldValue: string | null;
  newValue: string | null;
  content: string;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
  };
};

type TaskPhoto = {
  id: string;
  photoUrl: string;
  thumbnailUrl: string;
  caption: string | null;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
  };
};

type OptionUser = { id: string; fullName: string; email: string };

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toInputDate(dateIso: string | null) {
  if (!dateIso) return "";
  return dateIso.slice(0, 10);
}

function relative(dateIso: string) {
  return dayjs(dateIso).fromNow();
}

export function TaskDetailClient({
  initialTask,
  initialLogs,
  initialPhotos,
  engineers,
  foremen,
  currentUserId,
  currentUserRole,
}: {
  initialTask: TaskDetail;
  initialLogs: TaskLog[];
  initialPhotos: TaskPhoto[];
  engineers: OptionUser[];
  foremen: OptionUser[];
  currentUserId: string;
  currentUserRole: string;
}) {
  const [task, setTask] = useState<TaskDetail>(initialTask);
  const [logs, setLogs] = useState<TaskLog[]>(initialLogs);
  const [photos, setPhotos] = useState<TaskPhoto[]>(initialPhotos);

  const [status, setStatus] = useState<TaskDetail["status"]>(initialTask.status);
  const [naReason, setNaReason] = useState("");
  const [note, setNote] = useState("");

  const [plannedStart, setPlannedStart] = useState(toInputDate(initialTask.plannedStartDate));
  const [plannedEnd, setPlannedEnd] = useState(toInputDate(initialTask.plannedEndDate));
  const [actualStart, setActualStart] = useState(toInputDate(initialTask.actualStartDate));
  const [actualEnd, setActualEnd] = useState(toInputDate(initialTask.actualEndDate));

  const [assignedEngineerId, setAssignedEngineerId] = useState(initialTask.assignedEngineer?.id || "");
  const [assignedForemanId, setAssignedForemanId] = useState(initialTask.assignedForeman?.id || "");
  const [team, setTeam] = useState(initialTask.team || "");
  const [inspectorName, setInspectorName] = useState(initialTask.inspectorName || "");
  const [visibleToCustomer, setVisibleToCustomer] = useState(Boolean(initialTask.visibleToCustomer));

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const canChangeStatus = currentUserRole === "admin" || currentUserRole === "construction_manager";

  const canInspect =
    currentUserRole === "admin" ||
    currentUserRole === "construction_manager" ||
    currentUserId === task.project.mainEngineerId;
  const canEditDates =
    currentUserRole === "admin" ||
    currentUserRole === "construction_manager" ||
    currentUserId === task.project.projectManagerId;
  const canAssign = currentUserRole === "admin" || currentUserRole === "construction_manager";
  const canUpdateQc =
    currentUserRole === "admin" ||
    currentUserRole === "construction_manager" ||
    currentUserId === task.project.mainEngineerId ||
    currentUserId === task.assignedEngineer?.id;
  const canUploadPhoto =
    currentUserRole === "admin" ||
    currentUserRole === "construction_manager" ||
    currentUserId === task.project.mainEngineerId ||
    currentUserId === task.assignedEngineer?.id ||
    currentUserId === task.assignedForeman?.id;

  async function patchTask(section: string, payload: object) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Cập nhật thất bại");
      return null;
    }
    if (json.task) {
      setTask((prev) => ({ ...prev, ...json.task }));
    }
    toast.success(json.message || "Đã cập nhật");
    return json;
  }

  async function submitStatus() {
    if (status === "na" && !naReason.trim()) {
      toast.error("Vui lòng nhập lý do khi chuyển NA");
      return;
    }
    const json = await patchTask("status", { status, notes: naReason.trim() || undefined });
    if (json) {
      setLogs((prev) => [
        {
          id: `temp-${Date.now()}`,
          logType: "status_change",
          oldValue: task.status,
          newValue: status,
          content: `Đổi trạng thái từ ${task.status} -> ${status}`,
          createdAt: new Date().toISOString(),
          user: {
            id: currentUserId,
            fullName: "Bạn",
            email: "",
            avatarUrl: null,
          },
        },
        ...prev,
      ]);
      setTask((prev) => ({ ...prev, status }));
      setActualStart(toInputDate(json.task?.actualStartDate ?? null));
      setActualEnd(toInputDate(json.task?.actualEndDate ?? null));
    }
  }

  async function submitDates() {
    const json = await patchTask("dates", {
      plannedStartDate: plannedStart || null,
      plannedEndDate: plannedEnd || null,
      actualStartDate: actualStart || null,
      actualEndDate: actualEnd || null,
    });

    if (json?.task) {
      setPlannedStart(toInputDate(json.task.plannedStartDate));
      setPlannedEnd(toInputDate(json.task.plannedEndDate));
      setActualStart(toInputDate(json.task.actualStartDate));
      setActualEnd(toInputDate(json.task.actualEndDate));
    }
  }

  async function submitAssignment() {
    await patchTask("assignment", {
      assignedEngineerId: assignedEngineerId || null,
      assignedForemanId: assignedForemanId || null,
      team,
      inspectorName,
    });
  }

  async function submitCustomerVisibility() {
    const json = await patchTask("customer_visibility", {
      visibleToCustomer,
    });
    if (json?.task) {
      setTask((prev) => ({ ...prev, visibleToCustomer: Boolean(json.task.visibleToCustomer) }));
    }
  }

  async function submitNote() {
    if (!note.trim()) return;
    const res = await fetch(`/api/tasks/${task.id}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: note.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không thể ghi nhật ký");
      return;
    }
    toast.success("Đã ghi nhật ký");
    setLogs((prev) => [json.log, ...prev]);
    setNote("");
  }

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const formData = new FormData();
    acceptedFiles.forEach((file) => formData.append("files", file));

    const res = await fetch(`/api/tasks/${task.id}/photos`, {
      method: "POST",
      body: formData,
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Upload thất bại");
      return;
    }

    toast.success(json.message || "Upload thành công");
    setPhotos((prev) => [...json.photos, ...prev]);
    setLogs((prev) => [
      {
        id: `temp-photo-${Date.now()}`,
        logType: "photo_uploaded",
        oldValue: null,
        newValue: null,
        content: `Đã upload ${json.photos?.length || 0} ảnh`,
        createdAt: new Date().toISOString(),
        user: { id: currentUserId, fullName: "Bạn", email: "", avatarUrl: null },
      },
      ...prev,
    ]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: !canUploadPhoto,
    multiple: true,
    maxSize: 5 * 1024 * 1024,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
  });

  async function deletePhoto(photoId: string) {
    const res = await fetch(`/api/tasks/${task.id}/photos/${photoId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không xóa được ảnh");
      return;
    }
    toast.success(json.message || "Đã xóa ảnh");
    setPhotos((prev) => prev.filter((x) => x.id !== photoId));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIdx(null);
      if (lightboxIdx === null) return;
      if (e.key === "ArrowRight") {
        setLightboxIdx((idx) => (idx === null ? null : (idx + 1) % photos.length));
      }
      if (e.key === "ArrowLeft") {
        setLightboxIdx((idx) => (idx === null ? null : (idx - 1 + photos.length) % photos.length));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx, photos.length]);

  const milestoneBanner = task.isMilestone ? (
    <div className="rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-300">
      ⚠️ ĐIỂM DỪNG NGHIỆM THU — Chưa nghiệm thu không được làm công tác tiếp theo
    </div>
  ) : null;

  const [activeTab, setActiveTab] = useState<"qc" | "material" | "journal" | "info" | "status">("qc");
  const visibleTabs = [
    { key: "qc", label: "QC", icon: "🔍" },
    { key: "material", label: "Vật tư", icon: "🧱" },
    { key: "journal", label: "Nhật ký", icon: "📓" },
    { key: "info", label: "Thông tin", icon: "📋" },
    ...(canChangeStatus ? [{ key: "status", label: "Trạng thái", icon: "⚙️" }] : []),
  ] as const;

  const statusTileClass: Record<TaskDetail["status"], string> = {
    not_started: "",
    in_progress: "border-amber-500 bg-amber-500/15 text-amber-300",
    done: "border-emerald-500 bg-emerald-500/15 text-emerald-300",
    inspected: "border-sky-500 bg-sky-500/15 text-sky-300",
    delayed: "border-red-500 bg-red-500/15 text-red-300",
    na: "",
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-[#f0f2f8]">
      <div className="sticky top-0 z-40 border-b border-[#2e3347] bg-[#0f1117] px-4 pb-0 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#2e3347] bg-[#1a1d27] text-base"
            onClick={() => window.history.back()}
          >
            ←
          </button>
          <div className="truncate text-xs text-[#8891aa]">
            {task.project.code} › Tiến độ › Task {task.code}
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="text-3xl font-extrabold leading-none text-amber-500">{task.code}</div>
          <span className="rounded-full bg-sky-500/15 px-2 py-1 text-[11px] font-semibold text-sky-300">
            {PHASE_LABEL[task.phase]}
          </span>
          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span>
        </div>

        <div className="mb-2 text-base font-bold">{task.name}</div>
        {milestoneBanner}

        <div className="mt-3 flex overflow-x-auto border-b border-[#2e3347]">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              className={`flex h-12 flex-shrink-0 items-center gap-1 whitespace-nowrap border-b-2 px-4 text-xs font-semibold ${
                activeTab === tab.key ? "border-amber-500 text-amber-500" : "border-transparent text-[#8891aa]"
              }`}
              onClick={() => setActiveTab(tab.key as "qc" | "material" | "journal" | "info" | "status")}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {activeTab === "info" ? (
          <>
            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Kế hoạch</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase text-[#8891aa]">Ngày bắt đầu KH</label>
                  <input type="date" className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={plannedStart} disabled={!canEditDates} onChange={(e) => setPlannedStart(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase text-[#8891aa]">Ngày kết thúc KH</label>
                  <input type="date" className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={plannedEnd} disabled={!canEditDates} onChange={(e) => setPlannedEnd(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase text-[#8891aa]">Ngày BĐ thực tế</label>
                  <input type="date" className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={actualStart} disabled={!canEditDates} onChange={(e) => setActualStart(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase text-[#8891aa]">Ngày KT thực tế</label>
                  <input type="date" className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={actualEnd} disabled={!canEditDates} onChange={(e) => setActualEnd(e.target.value)} />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase text-[#8891aa]">Offset</label>
                  <input className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2 text-[#8891aa]" value={task.offsetDays} readOnly />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase text-[#8891aa]">Số ngày</label>
                  <input className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2 text-[#8891aa]" value={task.durationDays} readOnly />
                </div>
              </div>
              {canEditDates ? (
                <div className="mt-3 grid gap-2">
                  <Button variant="outline" className="border-[#2e3347] bg-[#222637] text-white" onClick={submitDates}>Lưu ngày</Button>
                  <Button variant="outline" className="border-[#2e3347] bg-[#222637] text-white" onClick={() => setActualEnd("")}>Xóa ngày KT thực tế</Button>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Phân công</div>
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase text-[#8891aa]">Đội thực hiện</label>
                  <input className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={team} disabled={!canAssign} onChange={(e) => setTeam(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase text-[#8891aa]">KS phụ trách</label>
                  <select className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={assignedEngineerId} disabled={!canAssign} onChange={(e) => setAssignedEngineerId(e.target.value)}>
                    <option value="">Chưa gán</option>
                    {engineers.map((u) => (
                      <option key={u.id} value={u.id}>{u.fullName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase text-[#8891aa]">Đội trưởng</label>
                  <select className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={assignedForemanId} disabled={!canAssign} onChange={(e) => setAssignedForemanId(e.target.value)}>
                    <option value="">Chưa gán</option>
                    {foremen.map((u) => (
                      <option key={u.id} value={u.id}>{u.fullName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase text-[#8891aa]">Người nghiệm thu</label>
                  <input className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2" value={inspectorName} disabled={!canAssign} onChange={(e) => setInspectorName(e.target.value)} />
                </div>
              </div>
              {canAssign ? (
                <>
                  <div className="mt-3 rounded-xl border border-[#2e3347] bg-[#222637] p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={visibleToCustomer} onChange={(e) => setVisibleToCustomer(e.target.checked)} />
                      Hiển thị task này ở Cổng chủ nhà
                    </label>
                  </div>
                  <Button className="mt-3 w-full bg-amber-500 font-bold text-[#0f1117] hover:bg-amber-600" onClick={submitAssignment}>Lưu phân công</Button>
                  <Button variant="outline" className="mt-2 w-full border-[#2e3347] bg-[#222637] text-white" onClick={submitCustomerVisibility}>Lưu hiển thị cổng chủ nhà</Button>
                </>
              ) : null}
            </div>
          </>
        ) : null}

        {activeTab === "qc" ? (
          <QcSection
            taskId={task.id}
            canUpdateQc={canUpdateQc}
            canManageItem={currentUserRole === "admin" || currentUserRole === "construction_manager" || currentUserRole === "engineer"}
          />
        ) : null}

        {activeTab === "material" ? (
          <MaterialSection
            taskId={task.id}
            canUpdateQc={canUpdateQc}
            canManageItem={currentUserRole === "admin" || currentUserRole === "construction_manager" || currentUserRole === "engineer"}
          />
        ) : null}

        {activeTab === "journal" ? <JournalSection taskId={task.id} /> : null}

        {activeTab === "status" ? (
          <>
            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Chọn trạng thái</div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(STATUS_LABEL) as TaskDetail["status"][]).map((k) => (
                  <button
                    key={k}
                    className={`rounded-xl border-2 p-3 text-xs font-semibold ${status === k ? statusTileClass[k] || "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] bg-[#222637] text-[#8891aa]"}`}
                    onClick={() => setStatus(k)}
                    disabled={!canChangeStatus}
                  >
                    {STATUS_LABEL[k]}
                  </button>
                ))}
              </div>

              <input
                placeholder="Lý do (chỉ bắt buộc khi chọn NA)"
                className="mt-3 w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2 text-sm"
                disabled={!canChangeStatus}
                value={naReason}
                onChange={(e) => setNaReason(e.target.value)}
              />

              {!canInspect && status === "inspected" ? (
                <p className="mt-2 text-xs text-red-400">Chỉ admin, trưởng phòng thi công hoặc KS chính mới được nghiệm thu.</p>
              ) : null}

              {canChangeStatus ? (
                <Button className="mt-3 w-full bg-amber-500 font-bold text-[#0f1117] hover:bg-amber-600" onClick={submitStatus}>
                  Cập nhật trạng thái
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {lightboxIdx !== null && photos[lightboxIdx] ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <button className="absolute right-4 top-4 text-white" onClick={() => setLightboxIdx(null)}>Đóng</button>
          <button className="absolute left-4 text-2xl text-white" onClick={() => setLightboxIdx((idx) => (idx === null ? null : (idx - 1 + photos.length) % photos.length))}>◀</button>
          <Image src={photos[lightboxIdx].photoUrl} alt="full" width={1200} height={900} className="max-h-[84vh] w-auto rounded-xl" />
          <button className="absolute right-4 text-2xl text-white" onClick={() => setLightboxIdx((idx) => (idx === null ? null : (idx + 1) % photos.length))}>▶</button>
        </div>
      ) : null}
    </div>
  );
}
