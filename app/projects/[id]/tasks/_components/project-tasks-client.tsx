"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TaskPhase, TaskStatus } from "@prisma/client";
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
  inspectorName: string;
  materialsNeeded: string;
  status: TaskStatus;
  isMilestone: boolean;
  template: {
    proposerRole: string;
    ordererRole: string;
    receiverRole: string;
  };
};

type EngineerOption = { id: string; fullName: string };

type TasksResponse = {
  project: { id: string; code: string; name: string };
  tasks: TaskRow[];
  engineers: EngineerOption[];
  role: string;
};

function fmtDate(dateIso: string) {
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
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

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadTasks() {
    setLoading(true);
    const params = new URLSearchParams({
      phase: phaseFilter,
      status: statusFilter,
      engineerId: engineerFilter,
      search,
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
  }, [phaseFilter, statusFilter, engineerFilter, search, projectId]);

  const isCanExport = role === "admin" || role === "accountant";

  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 8,
    enabled: tasks.length > 100,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const renderRow = (task: TaskRow) => (
    <tr
      key={task.id}
      className={`cursor-pointer border-b transition hover:bg-slate-50 ${task.isMilestone ? "bg-[#FFC7CE]" : ""}`}
      onClick={() => router.push(`/tasks/${task.id}`)}
    >
      <td className="px-2 py-2 text-center font-bold">{task.code}</td>
      <td className="px-2 py-2 text-center">
        <span
          className="inline-block rounded px-2 py-1 text-xs"
          style={{ backgroundColor: PHASE_COLOR[task.phase] }}
        >
          {PHASE_LABEL[task.phase]}
        </span>
      </td>
      <td className={`px-2 py-2 ${task.isMilestone ? "font-bold text-[#9C0006]" : ""}`}>
        {task.isMilestone ? "⚠️ " : ""}
        {task.name}
      </td>
      <td className="px-2 py-2 text-center">{task.offsetDays}</td>
      <td className="px-2 py-2 text-center">{task.durationDays}</td>
      <td className="px-2 py-2 text-center">{fmtDate(task.plannedStartDate)}</td>
      <td className="px-2 py-2 text-center">{fmtDate(task.plannedEndDate)}</td>
      <td className="px-2 py-2 text-center">{task.assignedForeman?.fullName || "-"}</td>
      <td className="px-2 py-2 text-center">{task.assignedEngineer?.fullName || "Chưa gán"}</td>
      <td className="px-2 py-2 text-center">{task.inspectorName || "-"}</td>
      <td className="max-w-[220px] truncate px-2 py-2" title={task.materialsNeeded}>
        {task.materialsNeeded}
      </td>
      <td className="px-2 py-2 text-center">{task.template?.proposerRole || "-"}</td>
      <td className="px-2 py-2 text-center">{task.template?.ordererRole || "-"}</td>
      <td className="px-2 py-2 text-center">{task.template?.receiverRole || "-"}</td>
      <td className="px-2 py-2 text-center">
        <span className={`rounded-full px-2 py-1 text-xs ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span>
      </td>
    </tr>
  );

  const mobileRows = useMemo(
    () =>
      tasks.map((task) => (
        <tr key={task.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={() => router.push(`/tasks/${task.id}`)}>
          <td className="px-2 py-2 text-center font-bold">{task.code}</td>
          <td className={`px-2 py-2 ${task.isMilestone ? "font-bold text-[#9C0006]" : ""}`}>
            {task.isMilestone ? "⚠️ " : ""}
            {task.name}
          </td>
          <td className="px-2 py-2 text-center">{fmtDate(task.plannedStartDate)}</td>
          <td className="px-2 py-2 text-center">
            <span className={`rounded-full px-2 py-1 text-xs ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span>
          </td>
        </tr>
      )),
    [tasks, router],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-[#1F4E79]">Tiến độ công tác</h2>
        {isCanExport ? (
          <Link href={`/api/projects/${projectId}/tasks/export`}>
            <Button variant="outline">Xuất Excel</Button>
          </Link>
        ) : null}
      </div>

      <div className="rounded-xl border bg-white">
        <div className="sticky top-0 z-10 border-b bg-white p-3">
          <div className="grid gap-2 md:grid-cols-4">
            <select className="rounded border px-3 py-2 text-sm" value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
              <option value="all">Tất cả phase</option>
              {Object.entries(PHASE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            <select className="rounded border px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            <select
              className="rounded border px-3 py-2 text-sm"
              value={engineerFilter}
              onChange={(e) => setEngineerFilter(e.target.value)}
            >
              <option value="">Tất cả KS phụ trách</option>
              {engineers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>

            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Search công tác..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block" ref={parentRef} style={{ maxHeight: 720 }}>
          <table className="w-full min-w-[2000px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-700">
              <tr>
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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={15} className="py-8 text-center text-slate-500">
                    Đang tải...
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-8 text-center text-slate-500">
                    Không có task nào
                  </td>
                </tr>
              ) : tasks.length > 100 ? (
                <>
                  <tr style={{ height: `${virtualItems[0]?.start || 0}px` }}>
                    <td colSpan={15} />
                  </tr>
                  {virtualItems.map((virtualRow) => renderRow(tasks[virtualRow.index]))}
                  <tr style={{ height: `${rowVirtualizer.getTotalSize() - (virtualItems.at(-1)?.end || 0)}px` }}>
                    <td colSpan={15} />
                  </tr>
                </>
              ) : (
                tasks.map((task) => renderRow(task))
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-slate-700">
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

      <div className="text-xs text-slate-500">{projectCode ? `Dự án: ${projectCode}` : ""} · Tổng {tasks.length} task</div>
    </div>
  );
}
