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

dayjs.extend(relativeTime);
dayjs.locale("vi");

type TaskDetail = {
  id: string;
  code: string;
  phase: keyof typeof PHASE_LABEL;
  name: string;
  isMilestone: boolean;
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
  logType: "status_change" | "note" | "photo_uploaded" | "assignment_change";
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

  const [actualStart, setActualStart] = useState(toInputDate(initialTask.actualStartDate));
  const [actualEnd, setActualEnd] = useState(toInputDate(initialTask.actualEndDate));

  const [assignedEngineerId, setAssignedEngineerId] = useState(initialTask.assignedEngineer?.id || "");
  const [assignedForemanId, setAssignedForemanId] = useState(initialTask.assignedForeman?.id || "");
  const [team, setTeam] = useState(initialTask.team || "");
  const [inspectorName, setInspectorName] = useState(initialTask.inspectorName || "");

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const checklistItems = useMemo(() => {
    return task.qcChecklist
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => (line.startsWith("•") ? line.replace(/^•\s*/, "") : line));
  }, [task.qcChecklist]);

  const checkedIndexes = useMemo<number[]>(() => {
    return Array.isArray(task.qcProgress?.checkedIndexes) ? task.qcProgress?.checkedIndexes || [] : [];
  }, [task.qcProgress]);

  const canChangeStatus =
    currentUserRole === "admin" ||
    currentUserRole === "construction_manager" ||
    currentUserId === task.project.projectManagerId ||
    currentUserId === task.project.mainEngineerId ||
    currentUserId === task.assignedEngineer?.id ||
    currentUserId === task.assignedForeman?.id;

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
    }
  }

  async function submitDates() {
    await patchTask("dates", {
      actualStartDate: actualStart || null,
      actualEndDate: actualEnd || null,
    });
  }

  async function submitAssignment() {
    await patchTask("assignment", {
      assignedEngineerId: assignedEngineerId || null,
      assignedForemanId: assignedForemanId || null,
      team,
      inspectorName,
    });
  }

  async function toggleChecklist(index: number) {
    const set = new Set(checkedIndexes);
    if (set.has(index)) set.delete(index);
    else set.add(index);
    const next = Array.from(set).sort((a, b) => a - b);
    const json = await patchTask("qc", { checkedIndexes: next });
    if (json?.task) {
      setTask((prev) => ({ ...prev, qcProgress: json.task.qcProgress }));
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
    <div className="rounded-md border border-red-300 bg-red-100 px-3 py-2 text-sm font-semibold text-red-700">
      ⚠️ ĐIỂM DỪNG NGHIỆM THU - Chưa nghiệm thu không được làm công tác tiếp theo
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      {milestoneBanner}

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="text-2xl font-bold text-[#1F4E79]">{task.code}</div>
          <span className="rounded px-2 py-1 text-xs" style={{ backgroundColor: PHASE_COLOR[task.phase] }}>
            {PHASE_LABEL[task.phase]}
          </span>
          <span className={`rounded-full px-2 py-1 text-xs ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span>
        </div>
        <div className="text-lg font-semibold">{task.name}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border bg-white p-4">
            <h3 className="mb-3 font-semibold">Section A - Kế hoạch & thực tế</h3>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <div>Ngày BĐ kế hoạch: {fmtDate(task.plannedStartDate)}</div>
              <div>Ngày KT kế hoạch: {fmtDate(task.plannedEndDate)}</div>
              <div>
                Ngày BĐ thực tế:
                <input
                  type="date"
                  className="ml-2 rounded border px-2 py-1"
                  value={actualStart}
                  disabled={!canEditDates}
                  onChange={(e) => setActualStart(e.target.value)}
                />
              </div>
              <div>
                Ngày KT thực tế:
                <input
                  type="date"
                  className="ml-2 rounded border px-2 py-1"
                  value={actualEnd}
                  disabled={!canEditDates}
                  onChange={(e) => setActualEnd(e.target.value)}
                />
              </div>
              <div>Offset: {task.offsetDays}</div>
              <div>Số ngày: {task.durationDays}</div>
            </div>
            {canEditDates ? (
              <Button variant="outline" className="mt-3" onClick={submitDates}>
                Lưu ngày thực tế
              </Button>
            ) : null}
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h3 className="mb-3 font-semibold">Section B - Phân công</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm">KS phụ trách</label>
                <select
                  className="w-full rounded border px-3 py-2 text-sm"
                  disabled={!canAssign}
                  value={assignedEngineerId}
                  onChange={(e) => setAssignedEngineerId(e.target.value)}
                >
                  <option value="">Chưa gán</option>
                  {engineers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm">Đội trưởng</label>
                <select
                  className="w-full rounded border px-3 py-2 text-sm"
                  disabled={!canAssign}
                  value={assignedForemanId}
                  onChange={(e) => setAssignedForemanId(e.target.value)}
                >
                  <option value="">Chưa gán</option>
                  {foremen.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm">Đội thực hiện</label>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  disabled={!canAssign}
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  placeholder="VD: Đội nề A"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Người nghiệm thu</label>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  disabled={!canAssign}
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                />
              </div>
            </div>
            {canAssign ? (
              <Button variant="outline" className="mt-3" onClick={submitAssignment}>
                Lưu phân công
              </Button>
            ) : null}
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h3 className="mb-3 font-semibold">Section C - Vật tư & trách nhiệm</h3>
            <div className="space-y-2 text-sm">
              <div>Vật tư cần: {task.materialsNeeded}</div>
              <div>Ai đề xuất: {task.template.proposerRole}</div>
              <div>Ai đặt hàng: {task.template.ordererRole}</div>
              <div>Ai nhận & kiểm: {task.template.receiverRole}</div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h3 className="mb-3 font-semibold">Section D - Checklist chất lượng (QC)</h3>
            <div className="mb-2 text-sm text-slate-600">
              Đã tick {checkedIndexes.length}/{checklistItems.length} mục
            </div>
            <div className="space-y-2 text-sm">
              {checklistItems.map((item, idx) => (
                <label key={idx} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checkedIndexes.includes(idx)}
                    disabled={!canUpdateQc}
                    onChange={() => toggleChecklist(idx)}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h3 className="mb-3 font-semibold">Section E - Đổi trạng thái</h3>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
              <select className="rounded border px-3 py-2 text-sm" disabled={!canChangeStatus} value={status} onChange={(e) => setStatus(e.target.value as TaskDetail["status"])}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                placeholder="Lý do (chỉ bắt buộc khi chọn NA)"
                className="rounded border px-3 py-2 text-sm"
                disabled={!canChangeStatus}
                value={naReason}
                onChange={(e) => setNaReason(e.target.value)}
              />
            </div>
            {!canInspect && status === "inspected" ? (
              <p className="mt-2 text-xs text-red-600">Chỉ admin, trưởng phòng thi công hoặc KS chính mới được nghiệm thu.</p>
            ) : null}
            {canChangeStatus ? (
              <Button className="mt-3 bg-[#1F4E79] hover:bg-[#163a5b]" onClick={submitStatus}>
                Cập nhật trạng thái
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border bg-white p-4">
            <h3 className="mb-3 font-semibold">Section F - Upload ảnh</h3>
            <div
              {...getRootProps()}
              className={`rounded border border-dashed p-4 text-center text-sm ${isDragActive ? "bg-blue-50" : ""}`}
            >
              <input {...getInputProps()} />
              Kéo thả ảnh vào đây hoặc bấm để chọn (JPG/PNG/WEBP, tối đa 5MB/ảnh)
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {photos.map((photo, idx) => (
                <div key={photo.id} className="space-y-1">
                  <button type="button" onClick={() => setLightboxIdx(idx)} className="block w-full">
                    <Image
                      src={photo.thumbnailUrl}
                      alt="thumb"
                      width={200}
                      height={200}
                      className="h-20 w-full rounded object-cover"
                    />
                  </button>
                  <div className="text-[11px] text-slate-500">{photo.user.fullName}</div>
                  {(currentUserRole === "admin" || photo.user.id === currentUserId) && (
                    <button className="text-xs text-red-600 underline" onClick={() => deletePhoto(photo.id)}>
                      Xóa
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h3 className="mb-3 font-semibold">Section G - Nhật ký</h3>
            <div className="max-h-[320px] space-y-3 overflow-auto pr-1">
              {logs.map((log) => (
                <div key={log.id} className="rounded border p-2 text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="font-medium">{log.user.fullName}</div>
                    <div className="text-slate-500">{relative(log.createdAt)}</div>
                  </div>
                  <div className="text-slate-600">{log.content}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h3 className="mb-3 font-semibold">Section H - Ghi chú mới</h3>
            <textarea
              className="w-full rounded border px-3 py-2 text-sm"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button className="mt-3 bg-[#1F4E79] hover:bg-[#163a5b]" onClick={submitNote}>
              Ghi nhật ký
            </Button>
          </div>
        </div>
      </div>

      {lightboxIdx !== null && photos[lightboxIdx] ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <button className="absolute right-6 top-6 text-white" onClick={() => setLightboxIdx(null)}>
            Đóng
          </button>
          <button
            className="absolute left-6 text-2xl text-white"
            onClick={() => setLightboxIdx((idx) => (idx === null ? null : (idx - 1 + photos.length) % photos.length))}
          >
            ◀
          </button>
          <Image
            src={photos[lightboxIdx].photoUrl}
            alt="full"
            width={1200}
            height={900}
            className="max-h-[85vh] w-auto rounded"
          />
          <button
            className="absolute right-6 text-2xl text-white"
            onClick={() => setLightboxIdx((idx) => (idx === null ? null : (idx + 1) % photos.length))}
          >
            ▶
          </button>
        </div>
      ) : null}
    </div>
  );
}
