"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TaskCategory, TaskPhase, TaskStatus } from "@prisma/client";
import { DndContext, type DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, ListFilter, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { PHASE_LABEL, STATUS_LABEL } from "@/lib/task-display";

type TaskRow = {
  id: string;
  code: string;
  phase: TaskPhase;
  name: string;
  offsetDays: number;
  durationDays: number;
  displayOrder?: number | null;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string | null;
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
  progressPercent: number | null;
  isMilestone: boolean;
  visibleToCustomer?: boolean;
  isActive: boolean;
  projectPhase?: {
    id: string;
    code: string;
    name: string;
    displayOrder: number;
    duration: number;
    plannedStartDate: string;
    plannedEndDate: string;
    actualStartDate: string | null;
    actualEndDate: string | null;
    status: "not_started" | "in_progress" | "completed";
  } | null;
};

type EngineerOption = { id: string; fullName: string };

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  phaseCode: string;
  phaseName: string;
  category: TaskCategory;
  defaultDurationDays: number;
  defaultOffsetDays: number;
  isMilestone: boolean;
};

type CreateTaskMode = "none" | "template" | "custom";

type CustomTaskFormState = {
  name: string;
  phaseId: string;
  durationDays: string;
  offsetDays: string;
  team: string;
  inspectorName: string;
  materialsNeeded: string;
  proposerRole: string;
  ordererRole: string;
  receiverRole: string;
  isMilestone: boolean;
  visibleToCustomer: boolean;
  category: TaskCategory;
};

type PhaseRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  duration: number;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
  status: "not_started" | "in_progress" | "completed";
};

type TasksResponse = {
  project: { id: string; code: string; name: string; startDate?: string; plannedDeadline?: string | null };
  tasks: TaskRow[];
  phases: PhaseRow[];
  engineers: EngineerOption[];
  role: string;
};

type DeadlineCheckResponse = {
  hasDeadline: boolean;
  plannedDeadline: string | null;
  totalPhaseDuration: number;
  calculatedEndDate: string | null;
  isOverDeadline: boolean;
  exceedDays: number;
};

type CreateTaskResponse = {
  message?: string;
  task?: {
    phaseId?: string | null;
  };
};

type PersistedTaskFilter = {
  phase: string;
  status: string;
  engineerId?: string;
  search: string;
  showDeleted?: boolean;
  sortBy: string;
  sortDir: "asc" | "desc";
};

type PhaseFormState = {
  mode: "create" | "edit";
  open: boolean;
  phaseId?: string;
  name: string;
  duration: string;
  description: string;
  displayOrder: string;
  confirmRunningChange: boolean;
};

type PhaseDeleteDetail = {
  id: string;
  name: string;
  projectId: string;
  tasks: Array<{ id: string; code: string; name: string; status: TaskStatus }>;
};

type PhaseDeleteState = {
  open: boolean;
  loading: boolean;
  phase: PhaseRow | null;
  detail: PhaseDeleteDetail | null;
  confirmName: string;
  confirmRisk: boolean;
};

const DEFAULT_SORT_BY = "displayOrder";
const DEFAULT_SORT_DIR: PersistedTaskFilter["sortDir"] = "asc";

const PHASE_CODE_OPTIONS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"];

const TASK_CATEGORY_OPTIONS: Array<{ value: TaskCategory; label: string }> = [
  { value: TaskCategory.normal, label: "Thường" },
  { value: TaskCategory.internal_milestone, label: "Milestone nội bộ" },
  { value: TaskCategory.major_milestone, label: "Milestone chính" },
];

const DEFAULT_CUSTOM_TASK_FORM: CustomTaskFormState = {
  name: "",
  phaseId: "",
  durationDays: "1",
  offsetDays: "0",
  team: "",
  inspectorName: "",
  materialsNeeded: "",
  proposerRole: "",
  ordererRole: "",
  receiverRole: "",
  isMilestone: false,
  visibleToCustomer: false,
  category: TaskCategory.normal,
};

function fmtDate(dateIso: string | null | undefined) {
  if (!dateIso) return "--/--";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "--/--";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function toInputDate(dateIso: string | null | undefined) {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function compareByDisplayOrder(a: TaskRow, b: TaskRow) {
  const ao = a.displayOrder ?? null;
  const bo = b.displayOrder ?? null;

  if (ao !== null && bo !== null && ao !== bo) return ao - bo;
  if (ao !== null && bo === null) return -1;
  if (ao === null && bo !== null) return 1;

  const aStart = new Date(a.plannedStartDate).getTime();
  const bStart = new Date(b.plannedStartDate).getTime();
  if (aStart !== bStart) return aStart - bStart;

  const aEnd = new Date(a.plannedEndDate).getTime();
  const bEnd = new Date(b.plannedEndDate).getTime();
  if (aEnd !== bEnd) return aEnd - bEnd;

  return a.id.localeCompare(b.id, "vi");
}

function statusGroupLabel(status: TaskStatus) {
  if (status === "delayed") return "Trễ hạn";
  if (status === "in_progress") return "Đang làm";
  if (status === "not_started") return "Sắp bắt đầu";
  if (status === "done" || status === "inspected") return "Hoàn thành";
  return "Khác";
}

function statusBadgeClass(status: TaskStatus) {
  if (status === "delayed") return "bg-red-500/15 text-red-300";
  if (status === "in_progress") return "bg-orange-500/20 text-orange-300";
  if (status === "done" || status === "inspected") return "bg-emerald-500/15 text-emerald-300";
  return "bg-[#13151f] text-[#8892b0]";
}

function statusBorderColor(status: TaskStatus) {
  if (status === "delayed") return "#ef4444";
  if (status === "in_progress") return "#f97316";
  if (status === "done" || status === "inspected") return "#22c55e";
  return "#2d3249";
}

function calcProgress(task: TaskRow) {
  if (typeof task.progressPercent === "number") return Math.max(0, Math.min(100, task.progressPercent));
  if (task.status === "done" || task.status === "inspected" || task.status === "internal_approved" || task.status === "completed") return 100;
  return 0;
}

function shouldShowProgressBar(task: TaskRow, progress: number) {
  return progress > 0 || task.status === "in_progress";
}

function phaseStatusText(status: PhaseRow["status"]) {
  if (status === "completed") return "Hoàn thành";
  if (status === "in_progress") return "Đang làm";
  return "Chưa bắt đầu";
}

function phaseStatusClass(status: PhaseRow["status"]) {
  if (status === "completed") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  if (status === "in_progress") return "bg-orange-500/15 text-orange-300 border-orange-500/40";
  return "bg-[#13151f] text-[#8892b0] border-[#2d3249]";
}

function getPhaseProgress(tasks: TaskRow[]) {
  const activeTasks = tasks.filter((task) => task.isActive);
  const total = activeTasks.length;
  const done = activeTasks.filter((task) => task.status === "done" || task.status === "inspected").length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, percent };
}

function SortablePhaseContainer({
  phaseId,
  children,
}: {
  phaseId: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phaseId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-70" : "opacity-100"}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-2 hidden cursor-grab rounded-md border border-[#2d3249] bg-[#13151f] p-1 text-[#8892b0] active:cursor-grabbing md:block"
          {...attributes}
          {...listeners}
          aria-label="Kéo để đổi thứ tự phase"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export function ProjectTasksClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const todayOnly = searchParams?.get("filter") === "today";
  const [loading, setLoading] = useState(true);
  const [savingPhase, setSavingPhase] = useState(false);
  const [deletingPhaseId, setDeletingPhaseId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [restoringTaskId, setRestoringTaskId] = useState<string | null>(null);
  const [reorderingPhaseId, setReorderingPhaseId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [phaseOrderDraft, setPhaseOrderDraft] = useState<PhaseRow[]>([]);
  const [expandedPhaseIds, setExpandedPhaseIds] = useState<Record<string, boolean>>({});
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [role, setRole] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDeadline, setProjectDeadline] = useState<string | null>(null);
  const [deadlineCheck, setDeadlineCheck] = useState<DeadlineCheckResponse | null>(null);

  const [phaseFilter, setPhaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [engineerFilter, setEngineerFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const [phaseForm, setPhaseForm] = useState<PhaseFormState>({
    mode: "create",
    open: false,
    name: "",
    duration: "",
    description: "",
    displayOrder: "1",
    confirmRunningChange: false,
  });

  const [phaseDelete, setPhaseDelete] = useState<PhaseDeleteState>({
    open: false,
    loading: false,
    phase: null,
    detail: null,
    confirmName: "",
    confirmRisk: false,
  });

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskMode, setCreateTaskMode] = useState<CreateTaskMode>("none");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templatePhaseCode, setTemplatePhaseCode] = useState("");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [customTaskSubmitting, setCustomTaskSubmitting] = useState(false);
  const [customTaskForm, setCustomTaskForm] = useState<CustomTaskFormState>(DEFAULT_CUSTOM_TASK_FORM);

  const loadedPersistedFilterRef = useRef(false);
  const latestRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const filterStorageKey = useMemo(() => `task-filter-${projectId}`, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(filterStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedTaskFilter>;
      if (typeof parsed.phase === "string") setPhaseFilter(parsed.phase);
      if (typeof parsed.status === "string") setStatusFilter(parsed.status);
      if (typeof parsed.engineerId === "string") setEngineerFilter(parsed.engineerId);
      if (typeof parsed.search === "string") {
        setSearchInput(parsed.search);
        setSearch(parsed.search.trim());
      }
      if (typeof parsed.showDeleted === "boolean") setShowDeleted(parsed.showDeleted);
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
    window.localStorage.setItem(
      filterStorageKey,
      JSON.stringify({
        phase: phaseFilter,
        status: statusFilter,
        engineerId: engineerFilter,
        search: searchInput,
        showDeleted,
        sortBy: DEFAULT_SORT_BY,
        sortDir: DEFAULT_SORT_DIR,
      }),
    );
  }, [filterStorageKey, phaseFilter, statusFilter, engineerFilter, searchInput, showDeleted]);

  async function loadTasks() {
    const requestId = ++latestRequestIdRef.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    const params = new URLSearchParams({
      phase: phaseFilter,
      status: statusFilter,
      engineerId: engineerFilter,
      search,
      ...(showDeleted ? { includeDeleted: "1" } : {}),
      ...(todayOnly ? { todayCheckin: "1" } : {}),
    });

    try {
      const [tasksRes, deadlineRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/tasks?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        }),
        fetch(`/api/projects/${projectId}/deadline-check`, {
          cache: "no-store",
          signal: controller.signal,
        }),
      ]);

      const data = (await tasksRes.json().catch(() => ({}))) as TasksResponse;
      const deadlineData = (await deadlineRes.json().catch(() => ({}))) as DeadlineCheckResponse;

      if (requestId !== latestRequestIdRef.current) return;

      setLoading(false);
      if (!tasksRes.ok) {
        setTasks([]);
        setPhases([]);
        setPhaseOrderDraft([]);
        setDeadlineCheck(null);
        return;
      }

      const nextPhases = (data.phases || []).sort((a, b) => a.displayOrder - b.displayOrder);

      setTasks(data.tasks || []);
      setPhases(nextPhases);
      setPhaseOrderDraft(nextPhases);
      setExpandedPhaseIds((prev) => {
        const next: Record<string, boolean> = {};
        nextPhases.forEach((phase) => {
          next[phase.id] = prev[phase.id] ?? false;
        });
        return next;
      });
      setEngineers(data.engineers || []);
      setRole(data.role || "");
      setProjectCode(data.project?.code || "");
      setProjectName(data.project?.name || "");
      setProjectDeadline(data.project?.plannedDeadline || null);

      if (deadlineRes.ok) {
        setDeadlineCheck(deadlineData);
      } else {
        setDeadlineCheck(null);
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      if (requestId !== latestRequestIdRef.current) return;
      setLoading(false);
      setTasks([]);
      setPhases([]);
      setPhaseOrderDraft([]);
      setDeadlineCheck(null);
      toast.error("Không tải được dữ liệu tiến độ");
    }
  }

  useEffect(() => {
    loadTasks();
    return () => {
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseFilter, statusFilter, engineerFilter, search, projectId, showDeleted, todayOnly]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reloadTasks = () => void loadTasks();
    window.addEventListener("focus", reloadTasks);
    window.addEventListener("pageshow", reloadTasks);
    return () => {
      window.removeEventListener("focus", reloadTasks);
      window.removeEventListener("pageshow", reloadTasks);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseFilter, statusFilter, engineerFilter, search, projectId, showDeleted, todayOnly]);

  useEffect(() => {
    if (!createTaskOpen || createTaskMode !== "template") return;
    void loadTemplateLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createTaskOpen, createTaskMode, templateSearch, templatePhaseCode, templateCategoryFilter]);

  function clearFilters() {
    setPhaseFilter("all");
    setStatusFilter("all");
    setEngineerFilter("");
    setSearchInput("");
    setSearch("");
    setShowDeleted(false);
  }

  function openTask(task: TaskRow, event?: React.MouseEvent<HTMLElement>) {
    const target = event?.target instanceof Element ? event.target : null;
    if (target?.closest("button,a,input,select,textarea")) return;
    if (task.isActive) router.push(`/tasks/${task.id}`);
  }

  async function deleteTask(task: TaskRow, event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!canDeleteTask) return;
    if (!await confirmDialog(`Xóa task ${task.code} - ${task.name}?`)) return;

    setDeletingTaskId(task.id);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast.error(data.message || "Không thể xóa task");
        return;
      }

      toast.success(data.message || "Đã xóa task");
      await loadTasks();
    } finally {
      setDeletingTaskId(null);
    }
  }

  async function restoreTask(task: TaskRow, event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!canDeleteTask) return;

    setRestoringTaskId(task.id);
    try {
      const res = await fetch(`/api/tasks/${task.id}/restore`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast.error(data.message || "Không thể khôi phục task");
        return;
      }

      toast.success(data.message || "Đã khôi phục task");
      await loadTasks();
    } finally {
      setRestoringTaskId(null);
    }
  }

  function openCreateTaskModal() {
    setCreateTaskOpen(true);
    setCreateTaskMode("none");
    setTemplates([]);
    setTemplateSearch("");
    setTemplatePhaseCode("");
    setTemplateCategoryFilter("");
    setSelectedTemplateId("");
    setCustomTaskForm({ ...DEFAULT_CUSTOM_TASK_FORM, phaseId: phases[0]?.id ?? "" });
  }

  function closeCreateTaskModal() {
    if (templateSubmitting || customTaskSubmitting || templateLoading) return;
    setCreateTaskOpen(false);
    setCreateTaskMode("none");
  }

  function revealCreatedTask(task: CreateTaskResponse["task"]) {
    if (!task?.phaseId) return;
    setExpandedPhaseIds((prev) => ({ ...prev, [task.phaseId!]: true }));
  }

  async function loadTemplateLibrary() {
    setTemplateLoading(true);
    try {
      const params = new URLSearchParams();
      if (templateSearch.trim()) params.set("q", templateSearch.trim());
      if (templatePhaseCode) params.set("phaseCode", templatePhaseCode);
      if (templateCategoryFilter) params.set("taskCategory", templateCategoryFilter);

      const res = await fetch(`/api/admin/templates?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { templates?: TemplateRow[]; message?: string };
      if (!res.ok) {
        toast.error(data.message || "Không tải được thư viện task");
        setTemplates([]);
        return;
      }

      const nextTemplates = data.templates || [];
      setTemplates(nextTemplates);
      if (selectedTemplateId && !nextTemplates.some((template) => template.id === selectedTemplateId)) {
        setSelectedTemplateId("");
      }
    } catch {
      toast.error("Không tải được thư viện task");
      setTemplates([]);
    } finally {
      setTemplateLoading(false);
    }
  }

  async function submitCreateFromTemplate() {
    if (!selectedTemplateId) {
      toast.error("Vui lòng chọn một template");
      return;
    }

    setTemplateSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/from-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplateId }),
      });
      const data = (await res.json().catch(() => ({}))) as CreateTaskResponse;
      if (!res.ok) {
        toast.error(data.message || "Không thể tạo task từ thư viện");
        return;
      }

      toast.success(data.message || "Đã thêm task từ thư viện");
      revealCreatedTask(data.task);
      setCreateTaskOpen(false);
      setCreateTaskMode("none");
      await loadTasks();
    } finally {
      setTemplateSubmitting(false);
    }
  }

  async function submitCreateCustomTask() {
    const name = customTaskForm.name.trim();
    const durationDays = Number(customTaskForm.durationDays);
    const offsetDays = Number(customTaskForm.offsetDays || "0");

    if (!name || name.length < 3) {
      toast.error("Tên task tối thiểu 3 ký tự");
      return;
    }

    if (!Number.isFinite(durationDays) || durationDays < 1) {
      toast.error("Số ngày phải >= 1");
      return;
    }

    if (!Number.isFinite(offsetDays) || offsetDays < 0) {
      toast.error("Offset ngày không hợp lệ");
      return;
    }

    if (!customTaskForm.inspectorName.trim()) {
      toast.error("Người nghiệm thu là bắt buộc");
      return;
    }

    if (!customTaskForm.proposerRole.trim() || !customTaskForm.ordererRole.trim() || !customTaskForm.receiverRole.trim()) {
      toast.error("Vui lòng điền đủ vai trò đề xuất/đặt hàng/nhận");
      return;
    }

    if (!customTaskForm.phaseId) {
      toast.error("Vui lòng chọn phase");
      return;
    }

    setCustomTaskSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phaseId: customTaskForm.phaseId,
          durationDays,
          offsetDays,
          team: customTaskForm.team.trim() || undefined,
          inspectorName: customTaskForm.inspectorName.trim(),
          materialsNeeded: customTaskForm.materialsNeeded.trim() || undefined,
          proposerRole: customTaskForm.proposerRole.trim(),
          ordererRole: customTaskForm.ordererRole.trim(),
          receiverRole: customTaskForm.receiverRole.trim(),
          isMilestone: customTaskForm.isMilestone,
          visibleToCustomer: customTaskForm.visibleToCustomer,
          category: customTaskForm.category,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as CreateTaskResponse;
      if (!res.ok) {
        toast.error(data.message || "Không thể tạo task tùy ý");
        return;
      }

      toast.success(data.message || "Đã thêm task tùy ý");
      revealCreatedTask(data.task);
      setCreateTaskOpen(false);
      setCreateTaskMode("none");
      setCustomTaskForm(DEFAULT_CUSTOM_TASK_FORM);
      await loadTasks();
    } finally {
      setCustomTaskSubmitting(false);
    }
  }

  function openCreatePhaseSheet() {
    setPhaseForm({
      mode: "create",
      open: true,
      name: "",
      duration: "",
      description: "",
      displayOrder: String(phases.length + 1),
      confirmRunningChange: false,
    });
  }

  function openEditPhaseSheet(phase: PhaseRow) {
    setPhaseForm({
      mode: "edit",
      open: true,
      phaseId: phase.id,
      name: phase.name,
      duration: String(phase.duration),
      description: phase.description || "",
      displayOrder: String(phase.displayOrder),
      confirmRunningChange: false,
    });
  }

  function togglePhaseExpanded(phaseId: string) {
    setExpandedPhaseIds((prev) => ({
      ...prev,
      [phaseId]: !prev[phaseId],
    }));
  }

  async function submitPhaseForm() {
    const name = phaseForm.name.trim();
    const duration = Number(phaseForm.duration);
    const displayOrder = Number(phaseForm.displayOrder);

    if (!name) {
      toast.error("Tên phase là bắt buộc");
      return;
    }

    if (!Number.isFinite(duration) || duration < 1) {
      toast.error("Số ngày phase phải >= 1");
      return;
    }

    if (!Number.isFinite(displayOrder) || displayOrder < 1) {
      toast.error("Thứ tự phase không hợp lệ");
      return;
    }

    setSavingPhase(true);

    try {
      if (phaseForm.mode === "create") {
        const res = await fetch(`/api/projects/${projectId}/phases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            duration,
            description: phaseForm.description.trim() || null,
            displayOrder,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) {
          toast.error(data.message || "Không thể tạo phase");
          return;
        }
        toast.success(data.message || "Đã thêm phase");
      } else {
        if (!phaseForm.phaseId) {
          toast.error("Không tìm thấy phase để cập nhật");
          return;
        }
        const res = await fetch(`/api/phases/${phaseForm.phaseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            duration,
            description: phaseForm.description.trim() || null,
            displayOrder,
            confirmRunningChange: phaseForm.confirmRunningChange,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) {
          toast.error(data.message || "Không thể cập nhật phase");
          return;
        }
        toast.success(data.message || "Đã cập nhật phase");
      }

      setPhaseForm((prev) => ({ ...prev, open: false }));
      await loadTasks();
    } finally {
      setSavingPhase(false);
    }
  }

  async function persistPhaseOrder(nextOrder: PhaseRow[]) {
    setReorderingPhaseId(nextOrder[0]?.id || "loading");

    try {
      const res = await fetch(`/api/projects/${projectId}/phases/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phaseIds: nextOrder.map((phase) => phase.id),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast.error(data.message || "Không thể sắp xếp phase");
        setPhaseOrderDraft(phases);
        return;
      }

      toast.success(data.message || "Đã cập nhật thứ tự phase");
      await loadTasks();
    } finally {
      setReorderingPhaseId(null);
    }
  }

  async function onPhaseDragEnd(event: DragEndEvent) {
    if (!canManagePhase) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = phaseOrderDraft.findIndex((phase) => phase.id === active.id);
    const newIndex = phaseOrderDraft.findIndex((phase) => phase.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const nextOrder = arrayMove(phaseOrderDraft, oldIndex, newIndex);
    setPhaseOrderDraft(nextOrder);
    await persistPhaseOrder(nextOrder);
  }

  async function openDeletePhaseModal(phase: PhaseRow) {
    setPhaseDelete({
      open: true,
      loading: true,
      phase,
      detail: null,
      confirmName: "",
      confirmRisk: false,
    });

    try {
      const res = await fetch(`/api/phases/${phase.id}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { phase?: PhaseDeleteDetail; message?: string };

      if (!res.ok || !data.phase) {
        setPhaseDelete({
          open: true,
          loading: false,
          phase,
          detail: null,
          confirmName: "",
          confirmRisk: false,
        });
        toast.error(data.message || "Không tải được thông tin phase");
        return;
      }

      setPhaseDelete((prev) => ({ ...prev, loading: false, detail: data.phase ?? null }));
    } catch {
      setPhaseDelete((prev) => ({ ...prev, loading: false }));
      toast.error("Không tải được thông tin phase");
    }
  }

  async function confirmDeletePhase() {
    if (!phaseDelete.phase) return;
    if (!phaseDelete.confirmRisk) {
      toast.error("Vui lòng xác nhận hiểu rõ rủi ro trước khi xóa");
      return;
    }

    if (phaseDelete.confirmName.trim() !== phaseDelete.phase.name) {
      toast.error("Tên phase xác nhận không khớp");
      return;
    }

    setDeletingPhaseId(phaseDelete.phase.id);

    try {
      const res = await fetch(`/api/phases/${phaseDelete.phase.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: phaseDelete.confirmName.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast.error(data.message || "Không thể xóa phase");
        return;
      }

      toast.success(data.message || "Đã xóa phase");
      setPhaseDelete({
        open: false,
        loading: false,
        phase: null,
        detail: null,
        confirmName: "",
        confirmRisk: false,
      });
      await loadTasks();
    } finally {
      setDeletingPhaseId(null);
    }
  }

  const isCanExport = role === "admin" || role === "accountant";
  const canManagePhase = role === "admin" || role === "construction_manager";
  const canCreateTask = role === "admin" || role === "construction_manager";
  const canDeleteTask = role === "admin" || role === "construction_manager";
  const canDeletePhase = role === "admin";

  const activeFilterCount = [phaseFilter !== "all", statusFilter !== "all", !!engineerFilter, !!search, showDeleted].filter(Boolean).length;

  const hasPhaseFilter = phaseFilter !== "all";
  const hasStatusFilter = statusFilter !== "all";

  const visibleTasks = useMemo(() => {
    return [...tasks].sort(compareByDisplayOrder);
  }, [tasks]);

  const grouped = useMemo(() => {
    if (!(hasStatusFilter && !hasPhaseFilter)) {
      return [["Tất cả", visibleTasks]] as [string, TaskRow[]][];
    }

    const map = new Map<string, TaskRow[]>();
    visibleTasks.forEach((task) => {
      const key = statusGroupLabel(task.status);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    });

    const orderedGroups = ["Trễ hạn", "Đang làm", "Sắp bắt đầu", "Hoàn thành"];
    return orderedGroups
      .map((label) => [label, map.get(label) ?? []] as [string, TaskRow[]])
      .filter(([, items]) => items.length > 0);
  }, [visibleTasks, hasStatusFilter, hasPhaseFilter]);

  const phaseTaskMap = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    const sorted = [...visibleTasks].sort(compareByDisplayOrder);
    sorted.forEach((task) => {
      const key = task.projectPhase?.id || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    });
    return map;
  }, [visibleTasks]);

  return (
    <div className="space-y-4">
      {todayOnly ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-2">
          <div className="text-sm text-orange-200">
            <span className="font-semibold">Đang lọc:</span> Nhiệm vụ KS đã check-in hôm nay
          </div>
          <button
            type="button"
            onClick={() => router.replace(`/projects/${projectId}/tasks`)}
            className="text-xs font-medium text-orange-300 underline"
          >
            Xoá lọc
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-orange-300">Tiến độ dự án</h2>
          {projectName ? <p className="text-xs text-[#8892b0]">{projectName}</p> : null}
        </div>

        <div className="flex items-center gap-2">
          {canCreateTask ? (
            <Button className="bg-emerald-500 text-black hover:bg-emerald-400" onClick={openCreateTaskModal}>
              <Plus className="mr-1 h-4 w-4" />
              Thêm task
            </Button>
          ) : null}
          {canManagePhase ? (
            <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={openCreatePhaseSheet}>
              <Plus className="mr-1 h-4 w-4" />
              Phase
            </Button>
          ) : null}
          {isCanExport ? <Link href={`/api/projects/${projectId}/tasks/export`}><Button variant="outline">Xuất Excel</Button></Link> : null}
          <Button
            className={activeFilterCount ? "rounded-[10px] border border-orange-400 bg-orange-500/15 px-3 py-2 text-orange-300" : "rounded-[10px] border border-[#2d3249] bg-[#13151f] px-3 py-2 text-[#8892b0]"}
            onClick={() => setShowFilterPanel((v) => !v)}
            aria-label="Mở bộ lọc"
            title="Lọc task"
          >
            <span className="inline-flex items-center gap-1">
              <ListFilter className="h-4 w-4" />
              {activeFilterCount ? <span className="text-xs font-semibold">({activeFilterCount})</span> : null}
            </span>
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#d9def3]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[#f0f2ff]">Deadline:</span>
          <span>{projectDeadline ? toInputDate(projectDeadline).split("-").reverse().join("/") : "Chưa đặt"}</span>
          {deadlineCheck?.calculatedEndDate ? (
            <span className="text-[#8892b0]">· KT dự kiến {fmtDate(deadlineCheck.calculatedEndDate)}</span>
          ) : null}
          {deadlineCheck ? <span className="text-[#8892b0]">· Tổng phase {deadlineCheck.totalPhaseDuration} ngày</span> : null}
        </div>

        {deadlineCheck?.isOverDeadline ? (
          <div className="mt-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            ⚠ Lệch deadline {deadlineCheck.exceedDays} ngày. Hãy giảm duration phase hoặc dời deadline dự án.
          </div>
        ) : null}
      </div>

      {showFilterPanel ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Lọc task</h3>
            <button type="button" className="text-xs text-orange-300" onClick={clearFilters}>Xóa tất cả</button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
              <option value="all">Tất cả phase</option>
              {Object.entries(PHASE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={engineerFilter} onChange={(e) => setEngineerFilter(e.target.value)}>
              <option value="">Tất cả KS phụ trách</option>
              {engineers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
            <input className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" placeholder="Search công tác..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            <label className="flex items-center gap-2 rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm">
              <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Hiển thị task đã xóa
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={() => setShowFilterPanel(false)}>Áp dụng</Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {loading ? <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-center text-sm text-[#8892b0]">Đang tải...</div> : null}

        {!loading && phaseOrderDraft.length === 0 ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-center text-sm text-[#8892b0]">Chưa có phase nào</div>
        ) : null}

        {!loading && todayOnly && visibleTasks.length === 0 && phaseOrderDraft.length > 0 ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-center text-sm text-[#8892b0]">
            Hôm nay KS chưa check-in nhiệm vụ nào trong dự án này.
          </div>
        ) : null}

        {!loading && phaseOrderDraft.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPhaseDragEnd}>
            <SortableContext items={phaseOrderDraft.map((phase) => phase.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {phaseOrderDraft
                  .filter((phase) => !todayOnly || (phaseTaskMap.get(phase.id) || []).length > 0)
                  .map((phase) => {
                  const phaseTasks = phaseTaskMap.get(phase.id) || [];
                  const phaseProgress = getPhaseProgress(phaseTasks);
                  const isPhaseExpanded = expandedPhaseIds[phase.id] ?? false;

                  return (
                    <SortablePhaseContainer key={phase.id} phaseId={phase.id}>
                      <div className="space-y-2">
                        <div className="rounded-2xl border border-[#3a4472] bg-gradient-to-r from-[#232a47] via-[#1d243d] to-[#171d31] p-4 shadow-[0_10px_28px_rgba(8,11,24,0.45)]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="mb-2 inline-flex items-center rounded-full border border-[#4a588f] bg-[#1d2440] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1.2px] text-[#cad4ff]">
                                Phase
                              </div>
                              <div className="truncate text-sm font-semibold text-[#f0f2ff]">{phase.code} - {phase.name}</div>
                              {phase.description ? <div className="mt-1 text-xs text-[#aeb8dc]">{phase.description}</div> : null}
                            </div>

                            <div className="flex items-center gap-1">
                              {canManagePhase ? (
                                <Button type="button" variant="outline" className="h-8 border-[#3f4a7a] bg-[#1b2137] px-2" onClick={() => openEditPhaseSheet(phase)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              ) : null}

                              {canDeletePhase ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 border-red-500/40 bg-[#2a1a24] px-2 text-red-300 hover:bg-red-500/10"
                                  onClick={() => openDeletePhaseModal(phase)}
                                  disabled={deletingPhaseId === phase.id}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}

                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 border-[#5160a0] bg-[#1c2340] px-2 text-[#d4dbff] hover:bg-[#27315a]"
                                onClick={() => togglePhaseExpanded(phase.id)}
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isPhaseExpanded ? "rotate-180" : "rotate-0"}`} />
                                <span className="ml-1 hidden text-xs sm:inline">{isPhaseExpanded ? "Thu gọn" : "Xổ task"}</span>
                              </Button>
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="h-2 rounded-full bg-[#2a3254]">
                              <div className="h-2 rounded-full bg-[#8aa0ff]" style={{ width: `${phaseProgress.percent}%` }} />
                            </div>
                            <div className="mt-1 text-xs text-[#b6c0e2]">{phaseProgress.percent}% ({phaseProgress.done}/{phaseProgress.total} task)</div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className={`rounded-full border px-2 py-0.5 ${phaseStatusClass(phase.status)}`}>{phaseStatusText(phase.status)}</span>
                            <span className="text-[#b6c0e2]">⏱ {phase.duration} ngày</span>
                            <span className="text-[#b6c0e2]">📅 KH: {fmtDate(phase.plannedStartDate)} → {fmtDate(phase.plannedEndDate)}</span>
                            <span className="text-[#b6c0e2]">🚀 TT: {fmtDate(phase.actualStartDate)} → {fmtDate(phase.actualEndDate)}</span>
                          </div>

                          {!isPhaseExpanded ? <div className="mt-2 text-[11px] text-[#98a6d8]">Nhấn Xổ task để xem danh sách công tác trong phase.</div> : null}
                        </div>

                        <div
                          className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                            isPhaseExpanded ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-70"
                          }`}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div
                              className={`space-y-2 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                isPhaseExpanded ? "translate-y-0" : "-translate-y-2"
                              }`}
                            >
                              {phaseTasks.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-[#2d3249] bg-[#13151f] px-4 py-3 text-xs text-[#8892b0]">Không có task theo bộ lọc hiện tại.</div>
                              ) : hasStatusFilter && !hasPhaseFilter ? (
                                grouped.map(([groupName, groupTasks]) => {
                                  const tasksInPhase = groupTasks.filter((task) => task.projectPhase?.id === phase.id);
                                  if (tasksInPhase.length === 0) return null;
                                  return (
                                    <div key={`${phase.id}-${groupName}`} className="space-y-2">
                                      <div className="px-2 text-xs font-semibold uppercase tracking-[1px] text-[#8892b0]">←──── {groupName} ({tasksInPhase.length}) ────→</div>
                                      {tasksInPhase.map((task) => {
                                        const progress = calcProgress(task);
                                        return (
                                          <div
                                            key={task.id}
                                            onClick={(event) => openTask(task, event)}
                                            className={`w-full rounded-[18px] border border-[#252840] bg-[#1a1d2e] px-4 py-[14px] text-left transition active:scale-[0.97] ${task.isActive ? "cursor-pointer" : "opacity-70"}`}
                                            style={{ borderLeft: `3px solid ${statusBorderColor(task.status)}` }}
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="rounded-md border border-[#2d3249] bg-[#13151f] px-2 py-0.5 text-[10px] uppercase tracking-[1px] text-[#8892b0]">{PHASE_LABEL[task.phase]}</span>
                                              <div className="flex items-center gap-2">
                                                {!task.isActive ? <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">Đã xóa</span> : null}
                                                <span className={`rounded-full px-2 py-1 text-xs ${statusBadgeClass(task.status)}`}>{STATUS_LABEL[task.status]}</span>
                                                {canDeleteTask && task.isActive ? (
                                                  <button type="button" className="rounded-full border border-red-500/40 bg-red-500/10 p-1 text-red-300 hover:bg-red-500/20" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => deleteTask(task, event)} disabled={deletingTaskId === task.id} title="Xóa task">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </button>
                                                ) : null}
                                                {canDeleteTask && !task.isActive ? (
                                                  <button type="button" className="rounded-full border border-emerald-500/40 bg-emerald-500/10 p-1 text-emerald-300 hover:bg-emerald-500/20" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => restoreTask(task, event)} disabled={restoringTaskId === task.id} title="Khôi phục task">
                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                  </button>
                                                ) : null}
                                              </div>
                                            </div>
                                            <div className="mt-2 text-[15px] font-bold text-[#f0f2ff]">{task.code} - {task.name}</div>
                                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#8892b0]">
                                              <span>⏱ {task.durationDays} ngày</span>
                                              <span>📅 Bắt đầu: {fmtDate(task.plannedStartDate)} → Hạn: {fmtDate(task.plannedEndDate)}</span>
                                            </div>
                                            <div className="mt-1 text-xs text-[#8892b0]">👷 {task.assignedEngineer?.fullName || "Chưa phân công"}</div>
                                            {shouldShowProgressBar(task, progress) ? (
                                              <div className="mt-3">
                                                <div className="h-[5px] rounded bg-[#252840]"><div className="h-[5px] rounded bg-[#f97316]" style={{ width: `${progress}%` }} /></div>
                                                <div className="mt-1 text-right text-xs text-[#8892b0]">{progress}%</div>
                                              </div>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })
                              ) : (
                                phaseTasks.map((task) => {
                                  const progress = calcProgress(task);
                                  return (
                                    <div
                                      key={task.id}
                                      onClick={(event) => openTask(task, event)}
                                      className={`w-full rounded-[18px] border border-[#252840] bg-[#1a1d2e] px-4 py-[14px] text-left transition active:scale-[0.97] ${task.isActive ? "cursor-pointer" : "opacity-70"}`}
                                      style={{ borderLeft: `3px solid ${statusBorderColor(task.status)}` }}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="rounded-md border border-[#2d3249] bg-[#13151f] px-2 py-0.5 text-[10px] uppercase tracking-[1px] text-[#8892b0]">{PHASE_LABEL[task.phase]}</span>
                                        <div className="flex items-center gap-2">
                                          {!task.isActive ? <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">Đã xóa</span> : null}
                                          <span className={`rounded-full px-2 py-1 text-xs ${statusBadgeClass(task.status)}`}>{STATUS_LABEL[task.status]}</span>
                                          {canDeleteTask && task.isActive ? (
                                            <button type="button" className="rounded-full border border-red-500/40 bg-red-500/10 p-1 text-red-300 hover:bg-red-500/20" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => deleteTask(task, event)} disabled={deletingTaskId === task.id} title="Xóa task">
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          ) : null}
                                          {canDeleteTask && !task.isActive ? (
                                            <button type="button" className="rounded-full border border-emerald-500/40 bg-emerald-500/10 p-1 text-emerald-300 hover:bg-emerald-500/20" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => restoreTask(task, event)} disabled={restoringTaskId === task.id} title="Khôi phục task">
                                              <RotateCcw className="h-3.5 w-3.5" />
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className="mt-2 text-[15px] font-bold text-[#f0f2ff]">{task.code} - {task.name}</div>
                                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#8892b0]">
                                        <span>⏱ {task.durationDays} ngày</span>
                                        <span>📅 Bắt đầu: {fmtDate(task.plannedStartDate)} → Hạn: {fmtDate(task.plannedEndDate)}</span>
                                      </div>
                                      <div className="mt-1 text-xs text-[#8892b0]">👷 {task.assignedEngineer?.fullName || "Chưa phân công"}</div>
                                      {shouldShowProgressBar(task, progress) ? (
                                        <div className="mt-3">
                                          <div className="h-[5px] rounded bg-[#252840]"><div className="h-[5px] rounded bg-[#f97316]" style={{ width: `${progress}%` }} /></div>
                                          <div className="mt-1 text-right text-xs text-[#8892b0]">{progress}%</div>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </SortablePhaseContainer>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        ) : null}

        {!loading && phases.length > 0 && (phaseTaskMap.get("__none__") || []).length > 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
            Có {(phaseTaskMap.get("__none__") || []).length} task chưa map phase mới, vẫn hiển thị theo cơ chế cũ.
          </div>
        ) : null}
      </div>

      <div className="text-xs text-[#8892b0]">{projectCode ? `Dự án: ${projectCode}` : ""} · Tổng {tasks.length} task</div>

      {createTaskOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4">
              <button type="button" className="absolute inset-0" onClick={closeCreateTaskModal} aria-label="Đóng" />
              <div className="relative z-10 w-full max-w-[720px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[#252840] bg-[#13151f] p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-lg font-semibold text-[#f0f2ff]">Thêm task vào dự án</div>
                  {createTaskMode !== "none" ? (
                    <Button
                      variant="outline"
                      className="h-8 border-[#2d3249] bg-[#1a1d2e] text-xs"
                      onClick={() => {
                        if (templateSubmitting || customTaskSubmitting) return;
                        setCreateTaskMode("none");
                      }}
                    >
                      Chọn lại loại
                    </Button>
                  ) : null}
                </div>

                {createTaskMode === "none" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateTaskMode("template");
                        setSelectedTemplateId("");
                      }}
                      className="rounded-2xl border border-[#2d3249] bg-[#1a1d2e] p-4 text-left transition hover:border-emerald-500/40"
                    >
                      <div className="text-sm font-semibold text-emerald-300">Task từ thư viện chuẩn</div>
                      <div className="mt-1 text-xs text-[#a4acc8]">Chọn mẫu có sẵn, giữ checklist QC và thông số mặc định.</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateTaskMode("custom");
                        setCustomTaskForm({ ...DEFAULT_CUSTOM_TASK_FORM, phaseId: phases[0]?.id ?? "" });
                      }}
                      className="rounded-2xl border border-[#2d3249] bg-[#1a1d2e] p-4 text-left transition hover:border-amber-500/40"
                    >
                      <div className="text-sm font-semibold text-amber-300">Task tùy ý</div>
                      <div className="mt-1 text-xs text-[#a4acc8]">Tạo công tác mới với mã TUY-YYYY-XXX và nhập thông tin thủ công.</div>
                    </button>
                  </div>
                ) : null}

                {createTaskMode === "template" ? (
                  <div className="space-y-3">
                    <div className="grid gap-2 md:grid-cols-3">
                      <input
                        className="rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                        placeholder="Tìm code hoặc tên template"
                        disabled={templateSubmitting}
                      />
                      <select
                        className="rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                        value={templatePhaseCode}
                        onChange={(e) => setTemplatePhaseCode(e.target.value)}
                        disabled={templateSubmitting}
                      >
                        <option value="">Tất cả phase</option>
                        {PHASE_CODE_OPTIONS.map((phaseCode) => (
                          <option key={phaseCode} value={phaseCode}>
                            {phaseCode}
                          </option>
                        ))}
                      </select>
                      <select
                        className="rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                        value={templateCategoryFilter}
                        onChange={(e) => setTemplateCategoryFilter(e.target.value)}
                        disabled={templateSubmitting}
                      >
                        <option value="">Tất cả loại task</option>
                        {TASK_CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {templateLoading ? <div className="text-sm text-[#8892b0]">Đang tải thư viện...</div> : null}

                    {!templateLoading && templates.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#2d3249] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">Không có template phù hợp.</div>
                    ) : null}

                    {!templateLoading ? (
                      <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                        {templates.map((template) => {
                          const selected = selectedTemplateId === template.id;
                          return (
                            <button
                              key={template.id}
                              type="button"
                              className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                                selected ? "border-emerald-500/50 bg-emerald-500/10" : "border-[#2d3249] bg-[#1a1d2e]"
                              }`}
                              onClick={() => setSelectedTemplateId(template.id)}
                              disabled={templateSubmitting}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-semibold text-[#f0f2ff]">
                                  {template.code} - {template.name}
                                </div>
                                <span className="rounded-md border border-[#2d3249] bg-[#13151f] px-2 py-0.5 text-[10px] text-[#a4acc8]">{template.phaseCode}</span>
                              </div>
                              <div className="mt-1 text-xs text-[#8892b0]">
                                {template.phaseName} · {template.defaultDurationDays} ngày · Offset {template.defaultOffsetDays} ngày
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={closeCreateTaskModal} disabled={templateSubmitting || templateLoading}>
                        Hủy
                      </Button>
                      <Button
                        className="bg-emerald-500 text-black hover:bg-emerald-400"
                        onClick={submitCreateFromTemplate}
                        disabled={!selectedTemplateId || templateSubmitting || templateLoading}
                      >
                        {templateSubmitting ? "Đang tạo..." : "Tạo task từ thư viện"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {createTaskMode === "custom" ? (
                  <div className="space-y-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs text-[#a4acc8]">Tên task</label>
                        <input
                          className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                          value={customTaskForm.name}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, name: e.target.value }))}
                          disabled={customTaskSubmitting}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-[#a4acc8]">Phase</label>
                        <select
                          className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                          value={customTaskForm.phaseId}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, phaseId: e.target.value }))}
                          disabled={customTaskSubmitting || phases.length === 0}
                        >
                          {phases.length === 0 ? (
                            <option value="">Dự án chưa có phase nào</option>
                          ) : (
                            <>
                              <option value="">— Chọn phase —</option>
                              {phases.map((phase) => (
                                <option key={phase.id} value={phase.id}>
                                  {phase.code} - {phase.name}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-[#a4acc8]">Loại task</label>
                        <select
                          className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                          value={customTaskForm.category}
                          onChange={(e) =>
                            setCustomTaskForm((prev) => ({
                              ...prev,
                              category: e.target.value as TaskCategory,
                            }))
                          }
                          disabled={customTaskSubmitting}
                        >
                          {TASK_CATEGORY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-[#a4acc8]">Số ngày</label>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                          value={customTaskForm.durationDays}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, durationDays: e.target.value }))}
                          disabled={customTaskSubmitting}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-[#a4acc8]">Offset ngày</label>
                        <input
                          type="number"
                          min={0}
                          className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                          value={customTaskForm.offsetDays}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, offsetDays: e.target.value }))}
                          disabled={customTaskSubmitting}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-[#a4acc8]">Team</label>
                        <input
                          className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                          value={customTaskForm.team}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, team: e.target.value }))}
                          disabled={customTaskSubmitting}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-[#a4acc8]">Người nghiệm thu</label>
                        <input
                          className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                          value={customTaskForm.inspectorName}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, inspectorName: e.target.value }))}
                          disabled={customTaskSubmitting}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-[#a4acc8]">Ai đề xuất</label>
                        <input
                          className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                          value={customTaskForm.proposerRole}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, proposerRole: e.target.value }))}
                          disabled={customTaskSubmitting}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-[#a4acc8]">Ai đặt hàng</label>
                        <input
                          className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                          value={customTaskForm.ordererRole}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, ordererRole: e.target.value }))}
                          disabled={customTaskSubmitting}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-[#a4acc8]">Ai nhận</label>
                        <input
                          className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                          value={customTaskForm.receiverRole}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, receiverRole: e.target.value }))}
                          disabled={customTaskSubmitting}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs text-[#a4acc8]">Vật tư cần</label>
                        <textarea
                          rows={2}
                          className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                          value={customTaskForm.materialsNeeded}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, materialsNeeded: e.target.value }))}
                          disabled={customTaskSubmitting}
                        />
                      </div>

                      <label className="flex items-center gap-2 rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-xs text-[#d9def3]">
                        <input
                          type="checkbox"
                          checked={customTaskForm.isMilestone}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, isMilestone: e.target.checked }))}
                          disabled={customTaskSubmitting}
                        />
                        Đánh dấu milestone
                      </label>

                      <label className="flex items-center gap-2 rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-xs text-[#d9def3]">
                        <input
                          type="checkbox"
                          checked={customTaskForm.visibleToCustomer}
                          onChange={(e) => setCustomTaskForm((prev) => ({ ...prev, visibleToCustomer: e.target.checked }))}
                          disabled={customTaskSubmitting}
                        />
                        Hiển thị cho chủ nhà
                      </label>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={closeCreateTaskModal} disabled={customTaskSubmitting}>
                        Hủy
                      </Button>
                      <Button
                        className="bg-amber-500 text-black hover:bg-amber-400"
                        onClick={submitCreateCustomTask}
                        disabled={customTaskSubmitting}
                      >
                        {customTaskSubmitting ? "Đang tạo..." : "Tạo task tùy ý"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      {phaseForm.open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
              <button
                type="button"
                className="absolute inset-0"
                onClick={() => {
                  if (savingPhase) return;
                  setPhaseForm((prev) => ({ ...prev, open: false }));
                }}
                aria-label="Đóng"
              />
              <div className="relative z-10 w-full max-w-[430px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[#252840] bg-[#13151f] p-4">
                <div className="mb-3 text-lg font-semibold text-[#f0f2ff]">
                  {phaseForm.mode === "create" ? "Thêm phase mới" : "Sửa phase"}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-[#a4acc8]">Tên phase</label>
                    <input
                      className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                      value={phaseForm.name}
                      onChange={(e) => setPhaseForm((prev) => ({ ...prev, name: e.target.value }))}
                      disabled={savingPhase}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#a4acc8]">Mô tả</label>
                    <textarea
                      rows={2}
                      className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                      value={phaseForm.description}
                      onChange={(e) => setPhaseForm((prev) => ({ ...prev, description: e.target.value }))}
                      disabled={savingPhase}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-[#a4acc8]">Số ngày</label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                        value={phaseForm.duration}
                        onChange={(e) => setPhaseForm((prev) => ({ ...prev, duration: e.target.value }))}
                        disabled={savingPhase}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-[#a4acc8]">Thứ tự</label>
                      <input
                        type="number"
                        min={1}
                        max={phaseForm.mode === "create" ? phases.length + 1 : phases.length}
                        className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                        value={phaseForm.displayOrder}
                        onChange={(e) => setPhaseForm((prev) => ({ ...prev, displayOrder: e.target.value }))}
                        disabled={savingPhase}
                      />
                    </div>
                  </div>

                  {phaseForm.mode === "edit" ? (
                    <label className="flex items-center gap-2 rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-xs text-[#d9def3]">
                      <input
                        type="checkbox"
                        checked={phaseForm.confirmRunningChange}
                        onChange={(e) => setPhaseForm((prev) => ({ ...prev, confirmRunningChange: e.target.checked }))}
                        disabled={savingPhase}
                      />
                      Xác nhận sửa duration khi phase đang chạy
                    </label>
                  ) : null}

                  <div className="rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-xs text-[#8892b0]">
                    Lưu ý: đổi duration hoặc thứ tự phase sẽ tự tính lại timeline của các phase sau.
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setPhaseForm((prev) => ({ ...prev, open: false }))} disabled={savingPhase}>Hủy</Button>
                    <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={submitPhaseForm} disabled={savingPhase}>
                      {savingPhase ? "Đang lưu..." : "Lưu"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {phaseDelete.open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
              <button
                type="button"
                className="absolute inset-0"
                onClick={() => {
                  if (deletingPhaseId) return;
                  setPhaseDelete({
                    open: false,
                    loading: false,
                    phase: null,
                    detail: null,
                    confirmName: "",
                    confirmRisk: false,
                  });
                }}
                aria-label="Đóng"
              />
              <div className="relative z-10 w-full max-w-[430px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[#252840] bg-[#13151f] p-4">
                <div className="mb-3 text-lg font-semibold text-red-300">Xác nhận xóa phase</div>

                {phaseDelete.loading ? (
                  <div className="rounded-xl border border-[#2d3249] bg-[#1a1d2e] p-3 text-sm text-[#8892b0]">Đang tải thông tin phase...</div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm text-[#d9def3]">
                      Phase <span className="font-semibold">{phaseDelete.phase?.name}</span> có {phaseDelete.detail?.tasks.length || 0} task.
                    </div>

                    {(phaseDelete.detail?.tasks.length || 0) > 0 ? (
                      <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[#2d3249] bg-[#1a1d2e] p-2 text-xs text-[#c4cae2]">
                        {phaseDelete.detail?.tasks.map((task) => (
                          <div key={task.id} className="rounded-md border border-[#252840] bg-[#13151f] px-2 py-1">
                            {task.code} - {task.name}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                      Xóa phase sẽ xóa mềm task trong phase này và không thể khôi phục.
                    </div>

                    <label className="flex items-center gap-2 rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-xs text-[#d9def3]">
                      <input
                        type="checkbox"
                        checked={phaseDelete.confirmRisk}
                        onChange={(e) => setPhaseDelete((prev) => ({ ...prev, confirmRisk: e.target.checked }))}
                        disabled={!!deletingPhaseId}
                      />
                      Tôi hiểu rõ rủi ro xóa vĩnh viễn phase này.
                    </label>

                    <div>
                      <label className="mb-1 block text-xs text-[#a4acc8]">Nhập tên phase để xác nhận</label>
                      <input
                        className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                        value={phaseDelete.confirmName}
                        onChange={(e) => setPhaseDelete((prev) => ({ ...prev, confirmName: e.target.value }))}
                        disabled={!!deletingPhaseId}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        disabled={!!deletingPhaseId}
                        onClick={() =>
                          setPhaseDelete({
                            open: false,
                            loading: false,
                            phase: null,
                            detail: null,
                            confirmName: "",
                            confirmRisk: false,
                          })
                        }
                      >
                        Hủy
                      </Button>
                      <Button
                        className="border border-red-500/40 bg-red-500 text-white hover:bg-red-600"
                        disabled={!!deletingPhaseId}
                        onClick={confirmDeletePhase}
                      >
                        {deletingPhaseId ? "Đang xóa..." : "Xóa vĩnh viễn"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {reorderingPhaseId ? <div className="text-xs text-[#8892b0]">Đang cập nhật thứ tự phase...</div> : null}
    </div>
  );
}
