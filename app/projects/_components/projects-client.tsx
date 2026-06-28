"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type ProjectItem = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  customerPhone: string;
  address: string;
  contractValue: number | null;
  startDate: string;
  expectedEndDate: string;
  status: "planning" | "in_progress" | "completed" | "paused";
  progressPercent: number;
};

type FilterUser = { id: string; fullName: string };

type ProjectsResponse = {
  projects: ProjectItem[];
  page: number;
  total: number;
  totalPages: number;
  role: string;
  filters: {
    projectManagers: FilterUser[];
    mainEngineers: FilterUser[];
  };
};

function statusChip(status: ProjectItem["status"]) {
  if (status === "in_progress") return "bg-blue-500/15 text-blue-300";
  if (status === "completed") return "bg-emerald-500/15 text-emerald-300";
  if (status === "paused") return "bg-amber-500/15 text-amber-300";
  return "bg-slate-500/15 text-slate-300";
}

function statusLabel(status: ProjectItem["status"]) {
  if (status === "in_progress") return "Đang thi công";
  if (status === "completed") return "Hoàn thành";
  if (status === "paused") return "Tạm ngưng";
  return "Planning";
}

export function ProjectsClient({ currentRole }: { currentRole: string }) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [projectManagers, setProjectManagers] = useState<FilterUser[]>([]);
  const [mainEngineers, setMainEngineers] = useState<FilterUser[]>([]);
  const [managerId, setManagerId] = useState("");
  const [engineerId, setEngineerId] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [status, managerId, engineerId]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const canViewAllProjects =
    currentRole === "admin" ||
    currentRole === "accountant" ||
    currentRole === "construction_manager";

  const activeFilterCount =
    (search ? 1 : 0) + (status !== "all" ? 1 : 0) + (managerId ? 1 : 0) + (engineerId ? 1 : 0);

  async function loadProjects() {
    setLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      search,
      status,
      projectManagerId: managerId,
      mainEngineerId: engineerId,
    });

    const res = await fetch(`/api/projects?${params.toString()}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as ProjectsResponse;

    setLoading(false);

    if (!res.ok) {
      setProjects([]);
      return;
    }

    setProjects(data.projects || []);
    setTotal(data.total || 0);
    setTotalPages(data.totalPages || 1);
    setProjectManagers(data.filters?.projectManagers || []);
    setMainEngineers(data.filters?.mainEngineers || []);
  }

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, status, managerId, engineerId]);

  const emptyText = useMemo(() => {
    if (canViewAllProjects) return "Chưa có dự án nào.";
    return "Bạn chưa được phân công vào dự án nào.";
  }, [canViewAllProjects]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-[#f0f2ff]">Danh sách dự án</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Bộ lọc"
              onClick={() => setFiltersOpen((v) => !v)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-xl border text-lg transition ${
                filtersOpen || activeFilterCount > 0
                  ? "border-[#f97316] bg-[#f97316]/10 text-[#fb923c]"
                  : "border-[#2d3249] bg-[#13151f] text-[#8892b0] hover:text-[#f0f2ff]"
              }`}
            >
              <span aria-hidden>⌕</span>
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f97316] px-1 text-[10px] font-bold text-black">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {currentRole === "admin" || currentRole === "construction_manager" ? (
              <Link href="/projects/new">
                <Button className="h-9 bg-[#f97316] text-black hover:bg-[#fb923c]">Tạo mới</Button>
              </Link>
            ) : null}
          </div>
        </div>

        {filtersOpen && (
          <div className="mt-3 grid gap-2">
            <input
              placeholder="Tìm mã / tên / chủ nhà / địa chỉ"
              className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />

            <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="planning">Planning</option>
              <option value="in_progress">Đang thi công</option>
              <option value="completed">Hoàn thành</option>
              <option value="paused">Tạm ngưng</option>
            </select>

            {canViewAllProjects ? (
              <>
                <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                  <option value="">Tất cả GĐ Thi Công</option>
                  {projectManagers.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName}</option>
                  ))}
                </select>

                <select className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" value={engineerId} onChange={(e) => setEngineerId(e.target.value)}>
                  <option value="">Tất cả KS chính</option>
                  {mainEngineers.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName}</option>
                  ))}
                </select>
              </>
            ) : null}

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setStatus("all");
                  setManagerId("");
                  setEngineerId("");
                }}
                className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-xs text-[#8892b0] hover:text-[#f0f2ff]"
              >
                Xoá bộ lọc
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-center text-sm text-[#8892b0]">Đang tải dữ liệu...</div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
            <div className="mb-2 text-2xl">📁</div>
            <div>{emptyText}</div>
          </div>
        ) : (
          projects.map((project, idx) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className={`block rounded-xl border border-[#252840] bg-[#1a1d2e] p-3 slide-up delay-${(idx % 6) + 1} transition hover:border-[#f97316]/40`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-[#8892b0]">{project.code}</div>
                  <div className="truncate text-sm font-semibold text-[#f0f2ff]">{project.name}</div>
                  <div className="truncate text-[11px] text-[#8892b0]">{project.address}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusChip(project.status)}`}>{statusLabel(project.status)}</span>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 rounded-full bg-[#252840]">
                  <div className="h-1 rounded-full bg-[#f97316]" style={{ width: `${Math.max(0, Math.min(100, project.progressPercent))}%` }} />
                </div>
                <span className="text-[10px] text-[#8892b0]">{Math.round(project.progressPercent)}%</span>
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-xs text-[#8892b0]">
        <div>{total ? `Tổng ${total} dự án` : "Không có dự án"}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-8 border-[#2d3249] bg-[#13151f]" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Trước
          </Button>
          <span>{page}/{totalPages}</span>
          <Button variant="outline" className="h-8 border-[#2d3249] bg-[#13151f]" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
