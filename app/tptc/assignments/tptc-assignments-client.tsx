"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Priority = "normal" | "important" | "urgent" | "critical";
type TptcStatus = "pending" | "in_progress" | "done" | "approved" | "rejected" | "cancelled";

type AssignmentRow = {
  id: string;
  projectId: string;
  taskId: string | null;
  assignedToUserId: string;
  assignedByUserId: string;
  title: string;
  description: string;
  priority: Priority;
  dueAt: string;
  status: TptcStatus;
  startedAt: string | null;
  completedAt: string | null;
  approvedAt: string | null;
  ksNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; code: string; name: string };
  task: { id: string; code: string; name: string } | null;
  assignee: { id: string; fullName: string };
  assigner: { id: string; fullName: string };
};

type TaskOption = { id: string; code: string; name: string };

type UserOption = { id: string; fullName: string; role: string; isActive: boolean };
type ProjectOption = { id: string; code: string; name: string; isActive: boolean };

type LookupResponse = {
  users: UserOption[];
  projects: ProjectOption[];
};

const PRIORITY_LABEL: Record<Priority, string> = {
  normal: "Thường",
  important: "Quan trọng",
  urgent: "Khẩn",
  critical: "Cực khẩn",
};

const STATUS_LABEL: Record<TptcStatus, string> = {
  pending: "Chờ làm",
  in_progress: "Đang làm",
  done: "KS báo xong",
  approved: "Đã duyệt",
  rejected: "Yêu cầu làm lại",
  cancelled: "Đã hủy",
};

const STATUS_OPTIONS: TptcStatus[] = ["pending", "in_progress", "done", "approved", "rejected", "cancelled"];

function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function TptcAssignmentsClient({
  canCreate,
  canApprove,
}: {
  canCreate: boolean;
  canApprove: boolean;
}) {
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<LookupResponse>({ users: [], projects: [] });
  const [statusFilter, setStatusFilter] = useState<"all" | TptcStatus>("all");
  const [ksFilter, setKsFilter] = useState<string>("all");
  const [draft, setDraft] = useState({
    projectId: "",
    taskId: "",
    assignedToUserId: "",
    title: "",
    description: "",
    priority: "normal" as Priority,
    dueAt: "",
  });
  const [tasksByProject, setTasksByProject] = useState<Record<string, TaskOption[]>>({});
  const [tasksLoading, setTasksLoading] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (statusFilter !== "all") query.set("status", statusFilter);
      if (ksFilter !== "all") query.set("ksId", ksFilter);

      const response = await fetch(`/api/tptc-assignments?${query.toString()}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Không tải được danh sách việc TPTC");
      }
      setRows((json.rows || []) as AssignmentRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách việc TPTC");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, ksFilter]);

  const loadLookups = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/users/options", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) return;

      const users = (json.engineers || []) as UserOption[];
      const projects = (json.projects || []) as ProjectOption[];
      setLookups({ users, projects });

      if (!draft.assignedToUserId && users[0]) {
        setDraft((prev) => ({ ...prev, assignedToUserId: users[0].id }));
      }
      if (!draft.projectId && projects[0]) {
        setDraft((prev) => ({ ...prev, projectId: projects[0].id }));
      }
    } catch {
      // ignore lookup errors and keep page usable
    }
  }, [draft.assignedToUserId, draft.projectId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (!draft.projectId || tasksByProject[draft.projectId]) return;
    let cancelled = false;
    setTasksLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/projects/${draft.projectId}/tasks`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const rows = ((json.tasks as Array<{ id: string; code: string; name: string }> | undefined) || []).map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
        }));
        setTasksByProject((prev) => ({ ...prev, [draft.projectId]: rows }));
      } catch {
        // ignore
      } finally {
        if (!cancelled) setTasksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.projectId, tasksByProject]);

  const currentTasks = tasksByProject[draft.projectId] || [];

  const groupedByKs = useMemo(() => {
    return rows.reduce<Record<string, { ksName: string; items: AssignmentRow[] }>>((acc, row) => {
      if (!acc[row.assignee.id]) {
        acc[row.assignee.id] = {
          ksName: row.assignee.fullName,
          items: [],
        };
      }
      acc[row.assignee.id].items.push(row);
      return acc;
    }, {});
  }, [rows]);

  async function submitCreate() {
    if (!canCreate) return;
    if (!draft.projectId || !draft.assignedToUserId || !draft.title.trim() || !draft.description.trim() || !draft.dueAt) {
      window.alert("Vui lòng nhập đầy đủ thông tin bắt buộc.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/tptc-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: draft.projectId,
          taskId: draft.taskId || null,
          assignedToUserId: draft.assignedToUserId,
          title: draft.title.trim(),
          description: draft.description.trim(),
          priority: draft.priority,
          dueAt: new Date(draft.dueAt).toISOString(),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Không thể giao việc TPTC");
      }

      setDraft((prev) => ({
        ...prev,
        title: "",
        description: "",
        taskId: "",
      }));
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể giao việc TPTC");
    } finally {
      setSaving(false);
    }
  }

  async function callAction(path: string, body: unknown) {
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

  async function approve(id: string) {
    if (!canApprove) return;
    const reviewNote = window.prompt("Nhập ghi chú duyệt (tuỳ chọn):", "")?.trim() || null;
    try {
      await callAction(`/api/tptc-assignments/${id}/approve`, { reviewNote });
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duyệt thất bại");
    }
  }

  async function reject(id: string) {
    if (!canApprove) return;
    const reviewNote = window.prompt("Nhập lý do reject:", "")?.trim();
    if (!reviewNote) return;
    try {
      await callAction(`/api/tptc-assignments/${id}/reject`, { reviewNote });
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject thất bại");
    }
  }

  async function remind(id: string) {
    setRemindingId(id);
    try {
      await callAction(`/api/tptc-assignments/${id}/remind`, {});
      setToast("Đã gửi nhắc tới KS");
      window.setTimeout(() => setToast((current) => (current === "Đã gửi nhắc tới KS" ? null : current)), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gửi nhắc thất bại");
    } finally {
      setRemindingId(null);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm("Xác nhận hủy việc này?")) return;
    try {
      await callAction(`/api/tptc-assignments/${id}/cancel`, {});
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hủy việc thất bại");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="text-lg font-bold text-[#f0f2ff]">⚡ Việc TPTC giao</div>
        <div className="mt-1 text-xs text-[#98a0c2]">Quản lý việc giao đột xuất cho KS, duyệt hoặc yêu cầu làm lại.</div>
      </div>

      {canCreate ? (
        <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4 space-y-3">
          <div className="text-sm font-semibold text-[#f0f2ff]">+ Giao việc mới</div>

          <div className="grid gap-2 md:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#98a0c2]">Dự án</span>
              <select
                className="w-full min-w-0 rounded border border-[#2f3555] bg-[#11182d] px-2 py-2 text-sm text-[#d9def3]"
                value={draft.projectId}
                onChange={(e) => setDraft((prev) => ({ ...prev, projectId: e.target.value, taskId: "" }))}
              >
                {lookups.projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                ))}
              </select>
            </label>

            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#98a0c2]">
                Task (tuỳ chọn){tasksLoading ? " · đang tải..." : ""}
              </span>
              <select
                className="w-full min-w-0 rounded border border-[#2f3555] bg-[#11182d] px-2 py-2 text-sm text-[#d9def3] disabled:opacity-60"
                value={draft.taskId}
                onChange={(e) => setDraft((prev) => ({ ...prev, taskId: e.target.value }))}
                disabled={!draft.projectId || tasksLoading}
              >
                <option value="">— Không gắn task —</option>
                {currentTasks.map((task) => (
                  <option key={task.id} value={task.id}>{task.code} · {task.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#98a0c2]">Giao cho KS</span>
              <select
                className="w-full min-w-0 rounded border border-[#2f3555] bg-[#11182d] px-2 py-2 text-sm text-[#d9def3]"
                value={draft.assignedToUserId}
                onChange={(e) => setDraft((prev) => ({ ...prev, assignedToUserId: e.target.value }))}
              >
                {lookups.users.map((user) => (
                  <option key={user.id} value={user.id}>{user.fullName}</option>
                ))}
              </select>
            </label>

            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#98a0c2]">Mức ưu tiên</span>
              <select
                className="w-full min-w-0 rounded border border-[#2f3555] bg-[#11182d] px-2 py-2 text-sm text-[#d9def3]"
                value={draft.priority}
                onChange={(e) => setDraft((prev) => ({ ...prev, priority: e.target.value as Priority }))}
              >
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((priority) => (
                  <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>
                ))}
              </select>
            </label>

            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#98a0c2]">Hạn chót</span>
              <input
                type="datetime-local"
                className="w-full min-w-0 rounded border border-[#2f3555] bg-[#11182d] px-2 py-2 text-sm text-[#d9def3]"
                value={draft.dueAt}
                onChange={(e) => setDraft((prev) => ({ ...prev, dueAt: e.target.value }))}
              />
            </label>
          </div>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#98a0c2]">Tiêu đề</span>
            <input
              className="w-full min-w-0 rounded border border-[#2f3555] bg-[#11182d] px-2 py-2 text-sm text-[#d9def3]"
              placeholder="Tiêu đề việc giao"
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#98a0c2]">Mô tả</span>
            <textarea
              className="w-full min-w-0 rounded border border-[#2f3555] bg-[#11182d] px-2 py-2 text-sm text-[#d9def3]"
              rows={3}
              placeholder="Mô tả chi tiết"
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
            />
          </label>

          <button
            type="button"
            onClick={submitCreate}
            disabled={saving}
            className="rounded border border-[#f97316]/30 bg-[#f97316]/10 px-3 py-2 text-sm font-semibold text-[#f97316] disabled:opacity-60"
          >
            {saving ? "Đang giao việc..." : "Giao việc"}
          </button>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <select
            className="min-w-0 flex-1 rounded border border-[#2f3555] bg-[#11182d] px-2 py-1.5 text-sm text-[#d9def3]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | TptcStatus)}
          >
            <option value="all">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{STATUS_LABEL[status]}</option>
            ))}
          </select>

          <select
            className="min-w-0 flex-1 rounded border border-[#2f3555] bg-[#11182d] px-2 py-1.5 text-sm text-[#d9def3]"
            value={ksFilter}
            onChange={(e) => setKsFilter(e.target.value)}
          >
            <option value="all">Tất cả KS</option>
            {lookups.users.map((user) => (
              <option key={user.id} value={user.id}>{user.fullName}</option>
            ))}
          </select>
        </div>

        {loading ? <div className="text-sm text-[#98a0c2]">Đang tải danh sách...</div> : null}
        {error ? <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-2 text-sm text-red-200">{error}</div> : null}

        {Object.entries(groupedByKs).map(([ksId, group]) => (
          <div key={ksId} className="rounded-xl border border-[#2f3555] p-3">
            <div className="text-sm font-semibold text-[#f0f2ff]">{group.ksName}</div>
            <div className="mt-2 space-y-2">
              {group.items.map((row) => (
                <div key={row.id} className="overflow-hidden rounded border border-[#2f3555] bg-[#11182d] p-3 text-sm text-[#d9def3]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-semibold">{row.title}</div>
                      <div className="break-words text-xs text-[#98a0c2]">
                        {row.project.code} · {row.project.name} · {PRIORITY_LABEL[row.priority]} · Hạn {fmtDateTime(row.dueAt)}
                      </div>
                      {row.task ? (
                        <div className="mt-0.5 break-words text-[11px] text-[#9eb5f7]">📌 Task: {row.task.code} · {row.task.name}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-xs text-[#98a0c2]">{STATUS_LABEL[row.status]}</div>
                  </div>

                  <div className="mt-2 whitespace-pre-wrap break-words text-xs text-[#b6c0e0]">{row.description}</div>
                  {row.ksNote ? <div className="mt-1 break-words text-xs text-[#9ed7b7]">KS note: {row.ksNote}</div> : null}
                  {row.reviewNote ? <div className="mt-1 break-words text-xs text-[#f7c58a]">Review: {row.reviewNote}</div> : null}

                  <div className="mt-2 break-words text-xs text-[#98a0c2]">Giao bởi {row.assigner.fullName} · Tạo lúc {fmtDateTime(row.createdAt)}</div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.status === "pending" || row.status === "in_progress" ? (
                      <button
                        type="button"
                        onClick={() => remind(row.id)}
                        disabled={remindingId === row.id}
                        className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs font-semibold text-sky-200 disabled:opacity-60"
                      >
                        {remindingId === row.id ? "Đang nhắc..." : "🔔 Nhắc KS"}
                      </button>
                    ) : null}

                    {row.status === "done" && canApprove ? (
                      <>
                        <button type="button" onClick={() => approve(row.id)} className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                          Duyệt OK
                        </button>
                        <button type="button" onClick={() => reject(row.id)} className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                          Yêu cầu lại
                        </button>
                      </>
                    ) : null}

                    {row.status !== "approved" && row.status !== "cancelled" ? (
                      <button type="button" onClick={() => cancel(row.id)} className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-200">
                        Hủy việc
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {!loading && rows.length === 0 ? <div className="text-sm text-[#98a0c2]">Không có việc phù hợp bộ lọc.</div> : null}
      </div>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <div className="pointer-events-auto rounded-full border border-sky-500/40 bg-[#0b1224]/95 px-4 py-2 text-sm font-semibold text-sky-100 shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
