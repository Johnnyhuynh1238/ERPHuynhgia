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

function fmtDate(dateIso: string) {
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

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

  const canViewAllProjects =
    currentRole === "admin" ||
    currentRole === "accountant" ||
    currentRole === "construction_manager";

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
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-[#f0f2ff]">Danh sách dự án</h1>
          {currentRole === "admin" ? (
            <Link href="/projects/new">
              <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]">Tạo mới</Button>
            </Link>
          ) : null}
        </div>

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
                <option value="">Tất cả GĐ quản lý</option>
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
        </div>
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
              className={`block rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 transition hover:border-[#fb923c]/60 slide-up delay-${(idx % 6) + 1}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-[#8892b0]">{project.code}</div>
                  <div className="text-sm font-bold text-[#f0f2ff]">{project.name}</div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusChip(project.status)}`}>{statusLabel(project.status)}</span>
              </div>

              <div className="text-xs text-[#8892b0]">{project.address}</div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-[#8892b0]">
                <span>Khởi công: {fmtDate(project.startDate)}</span>
                <span>{Math.round(project.progressPercent)}%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[#252840]">
                <div className="h-1.5 rounded-full bg-[#f97316]" style={{ width: `${Math.max(0, Math.min(100, project.progressPercent))}%` }} />
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
