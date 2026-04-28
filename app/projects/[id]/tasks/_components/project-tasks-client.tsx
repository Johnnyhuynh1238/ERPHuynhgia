"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TaskPhase, TaskStatus } from "@prisma/client";
import { toast } from "sonner";
import { ListFilter } from "lucide-react";
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

type EngineerOption = { id: string; fullName: string };

type TasksResponse = {
  project: { id: string; code: string; name: string };
  tasks: TaskRow[];
  engineers: EngineerOption[];
  role: string;
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

const DEFAULT_SORT_BY = "displayOrder";
const DEFAULT_SORT_DIR: PersistedTaskFilter["sortDir"] = "asc";

function fmtDate(dateIso: string) {
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function statusRank(status: TaskStatus) {
  if (status === "delayed") return 0;
  if (status === "in_progress") return 1;
  if (status === "not_started") return 2;
  if (status === "done" || status === "inspected") return 3;
  return 4;
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
  if (task.status === "done" || task.status === "inspected") return 100;
  if (task.status === "in_progress") return 60;
  return 0;
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
  const [showDeleted, setShowDeleted] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const loadedPersistedFilterRef = useRef(false);
  const latestRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    });

    try {
      const res = await fetch(`/api/projects/${projectId}/tasks?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as TasksResponse;

      if (requestId !== latestRequestIdRef.current) return;

      setLoading(false);
      if (!res.ok) {
        setTasks([]);
        return;
      }

      setTasks(data.tasks || []);
      setEngineers(data.engineers || []);
      setRole(data.role || "");
      setProjectCode(data.project?.code || "");
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      if (requestId !== latestRequestIdRef.current) return;
      setLoading(false);
      setTasks([]);
      toast.error("Không tải được danh sách task");
    }
  }

  useEffect(() => {
    loadTasks();
    return () => {
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseFilter, statusFilter, engineerFilter, search, projectId, showDeleted]);

  function clearFilters() {
    setPhaseFilter("all");
    setStatusFilter("all");
    setEngineerFilter("");
    setSearchInput("");
    setSearch("");
    setShowDeleted(false);
  }

  const isCanExport = role === "admin" || role === "accountant";
  const activeFilterCount = [phaseFilter !== "all", statusFilter !== "all", !!engineerFilter, !!search, showDeleted].filter(Boolean).length;

  const hasPhaseFilter = phaseFilter !== "all";
  const hasStatusFilter = statusFilter !== "all";

  const visibleTasks = useMemo(() => {
    // Trường hợp 1,2,4: sort displayOrder ASC (fallback date/id), không sort alphabet
    const list = [...tasks].sort(compareByDisplayOrder);
    return list;
  }, [tasks]);

  const grouped = useMemo(() => {
    // Chỉ nhóm khi Trường hợp 3: lọc trạng thái, không lọc phase
    if (!(hasStatusFilter && !hasPhaseFilter)) {
      return [["Tất cả", visibleTasks]] as [string, TaskRow[]][];
    }

    const map = new Map<string, TaskRow[]>();
    visibleTasks.forEach((t) => {
      const key = statusGroupLabel(t.status);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });

    const orderedGroups = ["Trễ hạn", "Đang làm", "Sắp bắt đầu", "Hoàn thành"];
    return orderedGroups
      .map((label) => [label, map.get(label) ?? []] as [string, TaskRow[]])
      .filter(([, items]) => items.length > 0);
  }, [visibleTasks, hasStatusFilter, hasPhaseFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-orange-300">Tiến độ công tác</h2>
        <div className="flex items-center gap-2">
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
        {!loading && visibleTasks.length === 0 ? <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-center text-sm text-[#8892b0]">Không có task nào</div> : null}

        {!loading ? grouped.map(([group, groupTasks]) => (
          <div key={group} className="space-y-2">
            {group !== "Tất cả" ? (
              <div className="px-2 text-xs font-semibold uppercase tracking-[1px] text-[#8892b0]">←──── {group} ({groupTasks.length}) ────→</div>
            ) : null}
            {groupTasks.map((task) => {
              const progress = calcProgress(task);
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => task.isActive && router.push(`/tasks/${task.id}`)}
                  className="w-full rounded-[18px] border border-[#252840] bg-[#1a1d2e] px-4 py-[14px] text-left transition active:scale-[0.97]"
                  style={{ borderLeft: `3px solid ${statusBorderColor(task.status)}`, cursor: task.isActive ? "pointer" : "default" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md border border-[#2d3249] bg-[#13151f] px-2 py-0.5 text-[10px] uppercase tracking-[1px] text-[#8892b0]">{PHASE_LABEL[task.phase]}</span>
                    <span className={`rounded-full px-2 py-1 text-xs ${statusBadgeClass(task.status)}`}>{STATUS_LABEL[task.status]}</span>
                  </div>
                  <div className="mt-2 text-[15px] font-bold text-[#f0f2ff]">{task.code} - {task.name}</div>
                  <div className="mt-2 text-xs text-[#8892b0]">📅 Bắt đầu: {fmtDate(task.plannedStartDate)}  →  Hạn: {fmtDate(task.plannedEndDate)}</div>
                  <div className="mt-1 text-xs text-[#8892b0]">👷 {task.assignedEngineer?.fullName || "Chưa phân công"}</div>
                  {task.status === "in_progress" ? (
                    <div className="mt-3">
                      <div className="h-[5px] rounded bg-[#252840]"><div className="h-[5px] rounded bg-[#f97316]" style={{ width: `${progress}%` }} /></div>
                      <div className="mt-1 text-right text-xs text-[#8892b0]">{progress}%</div>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )) : null}
      </div>

      <div className="text-xs text-[#8892b0]">{projectCode ? `Dự án: ${projectCode}` : ""} · Tổng {tasks.length} task</div>
    </div>
  );
}
