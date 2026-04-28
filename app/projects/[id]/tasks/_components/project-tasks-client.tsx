"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskPhase, TaskStatus } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PHASE_COLOR, PHASE_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/lib/task-display";

type TaskRow = {
  id: string;
  code: string;
  phase: TaskPhase;
  name: string;
  offsetDays: number;
  durationDays: number;
  plannedStartDate: string;
  plannedEndDate: string;
  assignedEngineer: { id: string; fullName: string } | null;
  assignedForeman: { id: string; fullName: string } | null;
  team: string | null;
  inspectorName: string;
  materialsNeeded: string;
  proposerRole: string;
  ordererRole: string;
  receiverRole: string;
  qcChecklist: string;
  status: TaskStatus;
  isMilestone: boolean;
  visibleToCustomer?: boolean;
  isActive: boolean;
};

const PHASE_CHOICES = [
  { value: "all", label: "Tất cả phase" },
  ...Object.entries(PHASE_LABEL).map(([value, label]) => ({ value, label })),
];

type EngineerOption = { id: string; fullName: string };

type TasksResponse = {
  project: { id: string; code: string; name: string };
  tasks: TaskRow[];
  engineers: EngineerOption[];
  role: string;
};

type TaskFormValues = {
  insertAfterTaskId: string;
  name: string;
  phase: TaskPhase;
  offsetDays: number;
  durationDays: number;
  team: string;
  inspectorName: string;
  materialsNeeded: string;
  proposerRole: string;
  ordererRole: string;
  receiverRole: string;
  qcChecklist: string;
  isMilestone: boolean;
  visibleToCustomer: boolean;
};

type PersistedTaskFilter = {
  phase: string;
  status: string;
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
};

const DEFAULT_SORT_BY = "displayOrder";
const DEFAULT_SORT_DIR: PersistedTaskFilter["sortDir"] = "asc";

const SORT_BY_CHOICES = [
  { value: "displayOrder", label: "Thứ tự" },
  { value: "plannedStartDate", label: "Ngày bắt đầu" },
  { value: "status", label: "Trạng thái" },
  { value: "name", label: "Tên công tác" },
] as const;

function fmtDate(dateIso: string) {
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function defaultTaskForm(tasks: TaskRow[]): TaskFormValues {
  const active = tasks.filter((t) => t.isActive);
  const last = active.at(-1);
  return {
    insertAfterTaskId: last?.id || "",
    name: "",
    phase: last?.phase || TaskPhase.P1_CHUAN_BI,
    offsetDays: 0,
    durationDays: 1,
    team: "",
    inspectorName: "",
    materialsNeeded: "",
    proposerRole: "",
    ordererRole: "",
    receiverRole: "",
    qcChecklist: "",
    isMilestone: false,
    visibleToCustomer: false,
  };
}

function SortableTaskRow({
  task,
  canManageTasks,
  canReorder,
  isSelected,
  canBulkInspect,
  onToggleSelect,
  onOpen,
  onEdit,
  onDelete,
}: {
  task: TaskRow;
  canManageTasks: boolean;
  canReorder: boolean;
  isSelected: boolean;
  canBulkInspect: boolean;
  onToggleSelect: (taskId: string) => void;
  onOpen: (task: TaskRow) => void;
  onEdit: (task: TaskRow) => void;
  onDelete: (task: TaskRow) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: task.id,
    disabled: !canReorder,
  });

  return (
    <tr
      ref={setNodeRef}
        className={`cursor-pointer border-b transition hover:bg-[#22263a] ${task.isMilestone ? "bg-red-500/12" : ""} ${isDragging ? "opacity-60" : ""}`}
      onClick={() => onOpen(task)}
    >
      <td className="px-2 py-2 text-center">
        {canBulkInspect && task.isActive ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(task.id)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : null}
      </td>

      <td className="px-2 py-2 text-center">
        {canManageTasks ? (
          <button
            type="button"
            className="rounded-lg border border-[#2d3249] bg-[#13151f] px-2 py-1 text-xs"
            {...attributes}
            {...listeners}
            disabled={!canReorder}
            onClick={(e) => e.stopPropagation()}
            title={canReorder ? "Kéo để sắp xếp" : "Bỏ filter để kéo sắp xếp"}
          >
            ↕
          </button>
        ) : null}
      </td>
      <td className="px-2 py-2 text-center font-bold">{task.code}</td>
      <td className="px-2 py-2 text-center">
        <span className="inline-block rounded px-2 py-1 text-xs" style={{ backgroundColor: PHASE_COLOR[task.phase] }}>
          {PHASE_LABEL[task.phase]}
        </span>
      </td>
      <td className={`px-2 py-2 ${task.isMilestone ? "font-bold text-red-300" : ""}`}>
        {task.isMilestone ? "⚠️ " : ""}
        {task.name}
        {task.visibleToCustomer ? <span className="ml-2 rounded bg-emerald-500/20 px-1 py-0.5 text-[10px] text-emerald-300">CN</span> : null}
      </td>
      <td className="px-2 py-2 text-center">{task.offsetDays}</td>
      <td className="px-2 py-2 text-center">{task.durationDays}</td>
      <td className="px-2 py-2 text-center">{fmtDate(task.plannedStartDate)}</td>
      <td className="px-2 py-2 text-center">{fmtDate(task.plannedEndDate)}</td>
      <td className="px-2 py-2 text-center">{task.team || task.assignedForeman?.fullName || "-"}</td>
      <td className="px-2 py-2 text-center">{task.assignedEngineer?.fullName || "Chưa gán"}</td>
      <td className="px-2 py-2 text-center">{task.inspectorName || "-"}</td>
      <td className="max-w-[220px] truncate px-2 py-2" title={task.materialsNeeded}>
        {task.materialsNeeded}
      </td>
      <td className="px-2 py-2 text-center">{task.proposerRole || "-"}</td>
      <td className="px-2 py-2 text-center">{task.ordererRole || "-"}</td>
      <td className="px-2 py-2 text-center">{task.receiverRole || "-"}</td>
      <td className="px-2 py-2 text-center">
        <span className={`rounded-full px-2 py-1 text-xs ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span>
      </td>
      <td className="px-2 py-2 text-center">
        {canManageTasks ? (
          <div className="flex justify-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(task);
              }}
            >
              Sửa
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task);
              }}
            >
              Xóa
            </Button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export function ProjectTasksClient({ projectId }: { projectId: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [role, setRole] = useState("");
  const [projectCode, setProjectCode] = useState("");

  const [phaseFilter, setPhaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [engineerFilter, setEngineerFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState(DEFAULT_SORT_BY);
  const [sortDir, setSortDir] = useState<PersistedTaskFilter["sortDir"]>(DEFAULT_SORT_DIR);
  const [showDeleted, setShowDeleted] = useState(false);
  const loadedPersistedFilterRef = useRef(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskFormValues>(defaultTaskForm([]));

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkPhase, setBulkPhase] = useState("all");
  const [bulkDate, setBulkDate] = useState("");

  const filterStorageKey = useMemo(() => `task-filter-${projectId}`, [projectId]);

  function resetTaskFilters() {
    setPhaseFilter("all");
    setStatusFilter("all");
    setSearchInput("");
    setSearch("");
    setSortBy(DEFAULT_SORT_BY);
    setSortDir(DEFAULT_SORT_DIR);
    setEngineerFilter("");
    setShowDeleted(false);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(filterStorageKey);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(filterStorageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<PersistedTaskFilter>;

      if (typeof parsed.phase === "string") setPhaseFilter(parsed.phase);
      if (typeof parsed.status === "string") setStatusFilter(parsed.status);

      if (typeof parsed.search === "string") {
        setSearchInput(parsed.search);
        setSearch(parsed.search.trim());
      }

      if (typeof parsed.sortBy === "string") {
        setSortBy(parsed.sortBy);
      }

      if (parsed.sortDir === "asc" || parsed.sortDir === "desc") {
        setSortDir(parsed.sortDir);
      }
    } catch {
      window.localStorage.removeItem(filterStorageKey);
    } finally {
      loadedPersistedFilterRef.current = true;
    }
  }, [filterStorageKey]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!loadedPersistedFilterRef.current) return;

    const payload: PersistedTaskFilter = {
      phase: phaseFilter,
      status: statusFilter,
      search: searchInput,
      sortBy,
      sortDir,
    };

    window.localStorage.setItem(filterStorageKey, JSON.stringify(payload));
  }, [filterStorageKey, phaseFilter, statusFilter, searchInput, sortBy, sortDir]);

  async function loadTasks() {
    setLoading(true);
    const params = new URLSearchParams({
      phase: phaseFilter,
      status: statusFilter,
      engineerId: engineerFilter,
      search,
      ...(showDeleted ? { includeDeleted: "1" } : {}),
    });

    const res = await fetch(`/api/projects/${projectId}/tasks?${params.toString()}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as TasksResponse;

    setLoading(false);
    if (!res.ok) {
      setTasks([]);
      return;
    }

    setTasks(data.tasks || []);
    setEngineers(data.engineers || []);
    setRole(data.role || "");
    setProjectCode(data.project?.code || "");
  }

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseFilter, statusFilter, engineerFilter, search, projectId, showDeleted]);

  useEffect(() => {
    setSelectedTaskIds([]);
  }, [phaseFilter, statusFilter, engineerFilter, search, showDeleted, projectId]);

  const isCanExport = role === "admin" || role === "accountant";
  const canManageTasks = role === "admin" || role === "construction_manager";
  const canBulkInspect = role === "admin" || role === "construction_manager";
  const canReorder =
    canManageTasks &&
    phaseFilter === "all" &&
    statusFilter === "all" &&
    !engineerFilter &&
    !search &&
    !showDeleted &&
    sortBy === DEFAULT_SORT_BY &&
    sortDir === DEFAULT_SORT_DIR;

  const sortedTasks = useMemo(() => {
    const list = [...tasks];

    if (sortBy === DEFAULT_SORT_BY) {
      return sortDir === "asc" ? list : list.reverse();
    }

    list.sort((a, b) => {
      const direction = sortDir === "asc" ? 1 : -1;

      if (sortBy === "plannedStartDate") {
        return (new Date(a.plannedStartDate).getTime() - new Date(b.plannedStartDate).getTime()) * direction;
      }

      if (sortBy === "status") {
        return a.status.localeCompare(b.status) * direction;
      }

      return a.name.localeCompare(b.name, "vi") * direction;
    });

    return list;
  }, [tasks, sortBy, sortDir]);

  const activeTasks = useMemo(() => sortedTasks.filter((t) => t.isActive), [sortedTasks]);
  const deletedTasks = useMemo(() => sortedTasks.filter((t) => !t.isActive), [sortedTasks]);

  const sortableIds = useMemo(() => activeTasks.map((t) => t.id), [activeTasks]);
  const sensors = useSensors(useSensor(PointerSensor));

  function openAddModal() {
    setTaskForm(defaultTaskForm(tasks));
    setShowAddModal(true);
  }

  function openEditModal(task: TaskRow) {
    setSelectedTask(task);
    setTaskForm({
      insertAfterTaskId: "",
      name: task.name,
      phase: task.phase,
      offsetDays: task.offsetDays,
      durationDays: task.durationDays,
      team: task.team || "",
      inspectorName: task.inspectorName,
      materialsNeeded: task.materialsNeeded,
      proposerRole: task.proposerRole,
      ordererRole: task.ordererRole,
      receiverRole: task.receiverRole,
      qcChecklist: task.qcChecklist,
      isMilestone: task.isMilestone,
      visibleToCustomer: Boolean(task.visibleToCustomer),
    });
    setShowEditModal(true);
  }

  async function submitAddTask() {
    if (!taskForm.insertAfterTaskId) {
      toast.error("Vui lòng chọn task để chèn sau");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        insertAfterTaskId: taskForm.insertAfterTaskId,
        name: taskForm.name,
        phase: taskForm.phase,
        durationDays: taskForm.durationDays,
        team: taskForm.team,
        inspectorName: taskForm.inspectorName,
        materialsNeeded: taskForm.materialsNeeded,
        proposerRole: taskForm.proposerRole,
        ordererRole: taskForm.ordererRole,
        receiverRole: taskForm.receiverRole,
        qcChecklist: taskForm.qcChecklist,
        isMilestone: taskForm.isMilestone,
        visibleToCustomer: taskForm.visibleToCustomer,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(json.message || "Thêm task thất bại");
      return;
    }

    toast.success(json.message || "Đã thêm task mới");
    setShowAddModal(false);
    await loadTasks();
  }

  async function submitEditTask() {
    if (!selectedTask) return;

    setSaving(true);
    const res = await fetch(`/api/tasks/${selectedTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "meta",
        payload: {
          name: taskForm.name,
          phase: taskForm.phase,
          offsetDays: taskForm.offsetDays,
          durationDays: taskForm.durationDays,
          team: taskForm.team,
          inspectorName: taskForm.inspectorName,
          materialsNeeded: taskForm.materialsNeeded,
          proposerRole: taskForm.proposerRole,
          ordererRole: taskForm.ordererRole,
          receiverRole: taskForm.receiverRole,
          qcChecklist: taskForm.qcChecklist,
          isMilestone: taskForm.isMilestone,
          visibleToCustomer: taskForm.visibleToCustomer,
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(json.message || "Sửa task thất bại");
      return;
    }

    toast.success(json.message || "Đã cập nhật task");
    setShowEditModal(false);
    setSelectedTask(null);
    await loadTasks();
  }

  async function handleDeleteTask(task: TaskRow) {
    const confirmed = window.confirm(`Xác nhận xóa task ${task.code} - ${task.name}?`);
    if (!confirmed) return;

    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Xóa task thất bại");
      return;
    }

    toast.success(json.message || "Đã xóa task");
    await loadTasks();
  }

  async function handleRestoreTask(task: TaskRow) {
    const res = await fetch(`/api/tasks/${task.id}/restore`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Khôi phục task thất bại");
      return;
    }

    toast.success(json.message || "Đã khôi phục task");
    await loadTasks();
  }

  async function onDragEnd(event: DragEndEvent) {
    if (!canReorder) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableIds.findIndex((id) => id === active.id);
    const newIndex = sortableIds.findIndex((id) => id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const orderedTaskIds = arrayMove(sortableIds, oldIndex, newIndex);
    const reorderPayload = orderedTaskIds.map((taskId, idx) => ({
      taskId,
      displayOrder: (idx + 1) * 100,
    }));

    const res = await fetch(`/api/projects/${projectId}/tasks/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reorderPayload),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Sắp xếp task thất bại");
      return;
    }

    toast.success(json.message || "Đã cập nhật thứ tự task");
    await loadTasks();
  }

  const activeSelectableTasks = useMemo(
    () => activeTasks.filter((task) => task.status !== "na"),
    [activeTasks],
  );

  const selectedCount = selectedTaskIds.length;

  function toggleTaskSelection(taskId: string) {
    setSelectedTaskIds((prev) => {
      if (prev.includes(taskId)) return prev.filter((id) => id !== taskId);
      return [...prev, taskId];
    });
  }

  function selectAllByPhase(phase: string) {
    if (phase === "all") {
      setSelectedTaskIds(activeSelectableTasks.map((task) => task.id));
      return;
    }
    setSelectedTaskIds(activeSelectableTasks.filter((task) => task.phase === phase).map((task) => task.id));
  }

  async function runBulkInspect() {
    if (!selectedTaskIds.length) {
      toast.error("Vui lòng chọn ít nhất 1 task");
      return;
    }

    const confirmed = window.confirm(`Xác nhận mark inspected cho ${selectedTaskIds.length} task đã chọn?`);
    if (!confirmed) return;

    const res = await fetch(`/api/projects/${projectId}/tasks/bulk-inspect`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds: selectedTaskIds, actualEndDate: bulkDate || undefined }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Bulk inspect thất bại");
      return;
    }

    toast.success(json.message || "Đã mark inspected");
    setSelectedTaskIds([]);
    setBulkDate("");
    setBulkPhase("all");
    await loadTasks();
  }

  const mobileRows = useMemo(
    () =>
      sortedTasks.map((task) => (
        <tr
          key={task.id}
          className={`border-b border-[#252840] ${task.isActive ? "cursor-pointer hover:bg-[#22263a]" : "bg-[#171a27] text-[#8892b0]"}`}
          onClick={() => {
            if (!task.isActive) return;
            router.push(`/tasks/${task.id}`);
          }}
        >
          <td className="px-2 py-2 text-center font-bold">{task.code}</td>
          <td className={`px-2 py-2 ${task.isMilestone ? "font-bold text-red-300" : ""}`}>
            {task.isMilestone ? "⚠️ " : ""}
            {task.name}
            {!task.isActive ? <span className="ml-2 rounded bg-[#2d3249] px-2 py-0.5 text-xs">Đã xóa</span> : null}
          </td>
          <td className="px-2 py-2 text-center">{fmtDate(task.plannedStartDate)}</td>
          <td className="px-2 py-2 text-center">
            <span className={`rounded-full px-2 py-1 text-xs ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span>
          </td>
        </tr>
      )),
    [sortedTasks, router],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-orange-300">Tiến độ công tác</h2>
        <div className="flex items-center gap-2">
          {canManageTasks ? (
            <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={openAddModal}>
              Thêm task mới
            </Button>
          ) : null}
          {isCanExport ? (
            <Link href={`/api/projects/${projectId}/tasks/export`}>
              <Button variant="outline">Xuất Excel</Button>
            </Link>
          ) : null}
        </div>
      </div>

      {canBulkInspect ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
          <div className="grid gap-2 md:grid-cols-4">
            <select
              className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
              value={bulkPhase}
              onChange={(e) => {
                const value = e.target.value;
                setBulkPhase(value);
                selectAllByPhase(value);
              }}
            >
              {PHASE_CHOICES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <input
              type="date"
              className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
            />

            <div className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm">Đã chọn {selectedCount} task</div>

            <Button variant="outline" onClick={runBulkInspect}>
              Mark inspected
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e]">
        <div className="sticky top-0 z-10 border-b border-[#252840] border-[#252840] bg-[#1a1d2e] p-3">
          <div className="grid gap-2 md:grid-cols-8">
            <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
              {PHASE_CHOICES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={engineerFilter} onChange={(e) => setEngineerFilter(e.target.value)}>
              <option value="">Tất cả KS phụ trách</option>
              {engineers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>

            <input
              className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
              placeholder="Search công tác..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />

            <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_BY_CHOICES.map((item) => (
                <option key={item.value} value={item.value}>
                  Sắp xếp: {item.label}
                </option>
              ))}
            </select>

            <select
              className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as PersistedTaskFilter["sortDir"])}
            >
              <option value="asc">Tăng dần</option>
              <option value="desc">Giảm dần</option>
            </select>

            <label className="flex items-center gap-2 rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm">
              <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
              Hiển thị task đã xóa
            </label>

            <Button variant="outline" onClick={resetTaskFilters}>Xóa filter</Button>
          </div>
          {canManageTasks && !canReorder ? (
            <p className="mt-2 text-xs text-[#8892b0]">Kéo sắp xếp chỉ khả dụng khi bỏ toàn bộ bộ lọc và tắt &quot;Hiển thị task đã xóa&quot;.</p>
          ) : null}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <table className="w-full min-w-[2160px] text-sm">
                <thead className="sticky top-0 z-10 bg-[#171a27] text-[#d9def3]">
                  <tr>
                    <th className="px-2 py-2 text-center">✓</th>
                    <th className="px-2 py-2 text-center">↕</th>
                    <th className="px-2 py-2 text-center">Mã</th>
                    <th className="px-2 py-2 text-center">Giai đoạn</th>
                    <th className="px-2 py-2 text-left">Công tác</th>
                    <th className="px-2 py-2 text-center">Offset</th>
                    <th className="px-2 py-2 text-center">Số ngày</th>
                    <th className="px-2 py-2 text-center">Ngày BĐ</th>
                    <th className="px-2 py-2 text-center">Ngày KT</th>
                    <th className="px-2 py-2 text-center">Đội thực hiện</th>
                    <th className="px-2 py-2 text-center">KS phụ trách</th>
                    <th className="px-2 py-2 text-center">Nghiệm thu</th>
                    <th className="px-2 py-2 text-left">Vật tư chính</th>
                    <th className="px-2 py-2 text-center">Ai đề xuất</th>
                    <th className="px-2 py-2 text-center">Ai đặt hàng</th>
                    <th className="px-2 py-2 text-center">Ai nhận & kiểm</th>
                    <th className="px-2 py-2 text-center">Trạng thái</th>
                    <th className="px-2 py-2 text-center">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={18} className="py-8 text-center text-[#8892b0]">
                        Đang tải...
                      </td>
                    </tr>
                  ) : tasks.length === 0 ? (
                    <tr>
                      <td colSpan={18} className="py-8 text-center text-[#8892b0]">
                        Không có task nào
                      </td>
                    </tr>
                  ) : (
                    <>
                      {activeTasks.map((task) => (
                        <SortableTaskRow
                          key={task.id}
                          task={task}
                          canManageTasks={canManageTasks}
                          canReorder={canReorder}
                          isSelected={selectedTaskIds.includes(task.id)}
                          canBulkInspect={canBulkInspect}
                          onToggleSelect={toggleTaskSelection}
                          onOpen={(x) => router.push(`/tasks/${x.id}`)}
                          onEdit={openEditModal}
                          onDelete={handleDeleteTask}
                        />
                      ))}

                      {showDeleted
                        ? deletedTasks.map((task) => (
                            <tr key={task.id} className="border-b border-[#252840] bg-[#171a27] text-[#8892b0]">
                              <td className="px-2 py-2 text-center">-</td>
                              <td className="px-2 py-2 text-center">-</td>
                              <td className="px-2 py-2 text-center font-bold">{task.code}</td>
                              <td className="px-2 py-2 text-center">
                                <span className="inline-block rounded px-2 py-1 text-xs" style={{ backgroundColor: PHASE_COLOR[task.phase] }}>
                                  {PHASE_LABEL[task.phase]}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                {task.name}
                                <span className="ml-2 rounded bg-[#2d3249] px-2 py-0.5 text-xs">Đã xóa</span>
                              </td>
                              <td className="px-2 py-2 text-center">{task.offsetDays}</td>
                              <td className="px-2 py-2 text-center">{task.durationDays}</td>
                              <td className="px-2 py-2 text-center">{fmtDate(task.plannedStartDate)}</td>
                              <td className="px-2 py-2 text-center">{fmtDate(task.plannedEndDate)}</td>
                              <td className="px-2 py-2 text-center">{task.team || task.assignedForeman?.fullName || "-"}</td>
                              <td className="px-2 py-2 text-center">{task.assignedEngineer?.fullName || "Chưa gán"}</td>
                              <td className="px-2 py-2 text-center">{task.inspectorName || "-"}</td>
                              <td className="max-w-[220px] truncate px-2 py-2" title={task.materialsNeeded}>
                                {task.materialsNeeded}
                              </td>
                              <td className="px-2 py-2 text-center">{task.proposerRole || "-"}</td>
                              <td className="px-2 py-2 text-center">{task.ordererRole || "-"}</td>
                              <td className="px-2 py-2 text-center">{task.receiverRole || "-"}</td>
                              <td className="px-2 py-2 text-center">
                                <span className={`rounded-full px-2 py-1 text-xs ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span>
                              </td>
                              <td className="px-2 py-2 text-center">
                                {canManageTasks ? (
                                  <Button size="sm" variant="outline" onClick={() => handleRestoreTask(task)}>
                                    Khôi phục
                                  </Button>
                                ) : null}
                              </td>
                            </tr>
                          ))
                        : null}
                    </>
                  )}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </div>

        <div className="overflow-x-auto md:hidden">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[#171a27] text-[#d9def3]">
              <tr>
                <th className="px-2 py-2 text-center">Mã</th>
                <th className="px-2 py-2 text-left">Công tác</th>
                <th className="px-2 py-2 text-center">Ngày BĐ</th>
                <th className="px-2 py-2 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody>{mobileRows}</tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-[#8892b0]">{projectCode ? `Dự án: ${projectCode}` : ""} · Tổng {tasks.length} task</div>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
          <div className="w-full max-w-2xl rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <h3 className="mb-3 text-lg font-semibold">Thêm task mới</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm">Chèn sau task nào *</label>
                <select
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.insertAfterTaskId}
                  onChange={(e) => {
                    const afterTask = activeTasks.find((x) => x.id === e.target.value);
                    setTaskForm((p) => ({
                      ...p,
                      insertAfterTaskId: e.target.value,
                      phase: afterTask?.phase || p.phase,
                    }));
                  }}
                >
                  <option value="">Chọn task</option>
                  {activeTasks.map((t) => (
                    <option key={t.id} value={t.id}>{`${t.code} - ${t.name}`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm">Tên task *</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.name}
                  onChange={(e) => setTaskForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Phase *</label>
                <select
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.phase}
                  onChange={(e) => setTaskForm((p) => ({ ...p, phase: e.target.value as TaskPhase }))}
                >
                  {Object.entries(PHASE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm">Số ngày *</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.durationDays}
                  onChange={(e) => setTaskForm((p) => ({ ...p, durationDays: Number(e.target.value || 1) }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Người nghiệm thu *</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.inspectorName}
                  onChange={(e) => setTaskForm((p) => ({ ...p, inspectorName: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Đội thực hiện</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.team}
                  onChange={(e) => setTaskForm((p) => ({ ...p, team: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Ai đề xuất *</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.proposerRole}
                  onChange={(e) => setTaskForm((p) => ({ ...p, proposerRole: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Ai đặt hàng *</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.ordererRole}
                  onChange={(e) => setTaskForm((p) => ({ ...p, ordererRole: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Ai nhận & kiểm *</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.receiverRole}
                  onChange={(e) => setTaskForm((p) => ({ ...p, receiverRole: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2 pt-7">
                <input
                  id="add-is-milestone"
                  type="checkbox"
                  checked={taskForm.isMilestone}
                  onChange={(e) => setTaskForm((p) => ({ ...p, isMilestone: e.target.checked }))}
                />
                <label htmlFor="add-is-milestone" className="text-sm">
                  Điểm dừng nghiệm thu
                </label>
              </div>

              <div className="flex items-center gap-2 pt-7">
                <input
                  id="add-visible-to-customer"
                  type="checkbox"
                  checked={taskForm.visibleToCustomer}
                  onChange={(e) => setTaskForm((p) => ({ ...p, visibleToCustomer: e.target.checked }))}
                />
                <label htmlFor="add-visible-to-customer" className="text-sm">
                  Hiển thị ở Cổng chủ nhà
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm">Vật tư chính *</label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.materialsNeeded}
                  onChange={(e) => setTaskForm((p) => ({ ...p, materialsNeeded: e.target.value }))}
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm">Checklist QC *</label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.qcChecklist}
                  onChange={(e) => setTaskForm((p) => ({ ...p, qcChecklist: e.target.value }))}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Hủy
              </Button>
              <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={submitAddTask} disabled={saving}>
                {saving ? "Đang thêm..." : "Thêm task"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditModal && selectedTask ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
          <div className="w-full max-w-2xl rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <h3 className="mb-3 text-lg font-semibold">Sửa task {selectedTask.code}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm">Tên task *</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.name}
                  onChange={(e) => setTaskForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Phase</label>
                <select
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.phase}
                  onChange={(e) => setTaskForm((p) => ({ ...p, phase: e.target.value as TaskPhase }))}
                >
                  {Object.entries(PHASE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm">Offset *</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.offsetDays}
                  onChange={(e) => setTaskForm((p) => ({ ...p, offsetDays: Number(e.target.value || 0) }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Số ngày *</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.durationDays}
                  onChange={(e) => setTaskForm((p) => ({ ...p, durationDays: Number(e.target.value || 1) }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Người nghiệm thu *</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.inspectorName}
                  onChange={(e) => setTaskForm((p) => ({ ...p, inspectorName: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Đội thực hiện</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.team}
                  onChange={(e) => setTaskForm((p) => ({ ...p, team: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Ai đề xuất *</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.proposerRole}
                  onChange={(e) => setTaskForm((p) => ({ ...p, proposerRole: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Ai đặt hàng *</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.ordererRole}
                  onChange={(e) => setTaskForm((p) => ({ ...p, ordererRole: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Ai nhận & kiểm *</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.receiverRole}
                  onChange={(e) => setTaskForm((p) => ({ ...p, receiverRole: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2 pt-7">
                <input
                  id="edit-is-milestone"
                  type="checkbox"
                  checked={taskForm.isMilestone}
                  onChange={(e) => setTaskForm((p) => ({ ...p, isMilestone: e.target.checked }))}
                />
                <label htmlFor="edit-is-milestone" className="text-sm">
                  Điểm dừng nghiệm thu
                </label>
              </div>

              <div className="flex items-center gap-2 pt-7">
                <input
                  id="edit-visible-to-customer"
                  type="checkbox"
                  checked={taskForm.visibleToCustomer}
                  onChange={(e) => setTaskForm((p) => ({ ...p, visibleToCustomer: e.target.checked }))}
                />
                <label htmlFor="edit-visible-to-customer" className="text-sm">
                  Hiển thị ở Cổng chủ nhà
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm">Vật tư chính *</label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.materialsNeeded}
                  onChange={(e) => setTaskForm((p) => ({ ...p, materialsNeeded: e.target.value }))}
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm">Checklist QC *</label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={taskForm.qcChecklist}
                  onChange={(e) => setTaskForm((p) => ({ ...p, qcChecklist: e.target.value }))}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Hủy
              </Button>
              <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={submitEditTask} disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
