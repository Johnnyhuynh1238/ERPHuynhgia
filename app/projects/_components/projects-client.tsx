"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Progress } from "@/components/ui/progress";
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

const statusLabel: Record<ProjectItem["status"], string> = {
  planning: "Planning",
  in_progress: "Đang thi công",
  completed: "Hoàn thành",
  paused: "Tạm ngưng",
};

const statusBadgeClass: Record<ProjectItem["status"], string> = {
  planning: "bg-slate-200 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-indigo-100 text-indigo-700",
  paused: "bg-amber-100 text-amber-700",
};

function formatDate(dateIso: string) {
  const date = new Date(dateIso);
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("vi-VN")} đ`;
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

  const isAdminLike = currentRole === "admin" || currentRole === "accountant";
  const canViewFinancial = isAdminLike;

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
    if (isAdminLike) {
      return "Chưa có dự án nào. Anh có thể tạo dự án đầu tiên.";
    }
    return "Bạn chưa được phân công vào dự án nào. Liên hệ quản lý.";
  }, [isAdminLike]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-[#1F4E79]">Danh sách dự án</h1>
        {currentRole === "admin" ? (
          <Link href="/projects/new">
            <Button className="bg-[#1F4E79] hover:bg-[#163a5b]">Tạo dự án mới</Button>
          </Link>
        ) : null}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-5">
          <input
            placeholder="Search mã/tên/chủ nhà/địa chỉ"
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />

          <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="planning">Planning</option>
            <option value="in_progress">Đang thi công</option>
            <option value="completed">Hoàn thành</option>
            <option value="paused">Tạm ngưng</option>
          </select>

          {isAdminLike ? (
            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
            >
              <option value="">Tất cả GĐ quản lý</option>
              {projectManagers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          ) : (
            <div />
          )}

          {isAdminLike ? (
            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={engineerId}
              onChange={(e) => setEngineerId(e.target.value)}
            >
              <option value="">Tất cả KS chính</option>
              {mainEngineers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          ) : (
            <div />
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-600">
                <th className="px-3 py-2">Mã dự án</th>
                <th className="px-3 py-2">Tên dự án</th>
                <th className="px-3 py-2">Chủ nhà + SĐT</th>
                <th className="px-3 py-2">Địa chỉ</th>
                {canViewFinancial ? <th className="px-3 py-2">Giá trị HĐ</th> : null}
                <th className="px-3 py-2">Khởi công</th>
                <th className="px-3 py-2">Bàn giao dự kiến</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Tiến độ</th>
                <th className="px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={canViewFinancial ? 10 : 9}>
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={canViewFinancial ? 10 : 9}>
                    <div className="mb-2 text-2xl">📁</div>
                    <div>{emptyText}</div>
                    {currentRole === "admin" ? (
                      <Link className="mt-2 inline-block text-[#1F4E79] underline" href="/projects/new">
                        Tạo dự án đầu tiên
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ) : (
                projects.map((project) => (
                  <tr key={project.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium text-[#1F4E79]">{project.code}</td>
                    <td className="px-3 py-2">{project.name}</td>
                    <td className="px-3 py-2">
                      <div>{project.customerName}</div>
                      <div className="text-xs text-slate-500">{project.customerPhone}</div>
                    </td>
                    <td className="px-3 py-2">{project.address}</td>
                    {canViewFinancial ? <td className="px-3 py-2">{formatMoney(project.contractValue ?? 0)}</td> : null}
                    <td className="px-3 py-2">{formatDate(project.startDate)}</td>
                    <td className="px-3 py-2">{formatDate(project.expectedEndDate)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass[project.status]}`}>
                        {statusLabel[project.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Progress value={project.progressPercent} className="w-28" />
                        <span>{project.progressPercent}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/projects/${project.id}`}>
                        <Button variant="outline" className="h-8">
                          Xem chi tiết
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <div>{total ? `Tổng ${total} dự án` : "Không có dự án"}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Trang trước
            </Button>
            <span>
              {page}/{totalPages}
            </span>
            <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Trang sau
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
