import { NextResponse } from "next/server";
import { ProjectStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

const STATUS_PRIORITY: Record<ProjectStatus, number> = {
  in_progress: 0,
  planning: 1,
  paused: 2,
  completed: 3,
};

function mapAuthError(message: string) {
  if (message === "401_UNAUTHORIZED") {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (message === "403_FORBIDDEN") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = 10;

  const search = (searchParams.get("search") || "").trim();
  const statusFilter = searchParams.get("status");
  const managerFilter = searchParams.get("projectManagerId") || "";
  const engineerFilter = searchParams.get("mainEngineerId") || "";

  const isAdminLike = user.role === UserRole.admin || user.role === UserRole.accountant;

  const accessWhere = isAdminLike
    ? {}
    : {
        OR: [
          { projectManagerId: user.id },
          { mainEngineerId: user.id },
          {
            projectMembers: {
              some: {
                userId: user.id,
              },
            },
          },
        ],
      };

  const where = {
    ...accessWhere,
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
            { customerName: { contains: search, mode: "insensitive" as const } },
            { address: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(statusFilter && statusFilter !== "all"
      ? {
          status: statusFilter as ProjectStatus,
        }
      : {}),
    ...(isAdminLike && managerFilter
      ? {
          projectManagerId: managerFilter,
        }
      : {}),
    ...(isAdminLike && engineerFilter
      ? {
          mainEngineerId: engineerFilter,
        }
      : {}),
  };

  const projectsRaw = await prisma.project.findMany({
    where,
    include: {
      projectManager: {
        select: { id: true, fullName: true },
      },
      mainEngineer: {
        select: { id: true, fullName: true },
      },
    },
  });

  const projectsSorted = projectsRaw.sort((a, b) => {
    const p = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (p !== 0) return p;
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });

  const total = projectsSorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const projectsPage = projectsSorted.slice(start, start + pageSize);

  const ids = projectsPage.map((p) => p.id);

  const [inspectedCounts, validCounts] = await Promise.all([
    prisma.task.groupBy({
      by: ["projectId"],
      where: {
        projectId: { in: ids },
        status: "inspected",
      },
      _count: { projectId: true },
    }),
    prisma.task.groupBy({
      by: ["projectId"],
      where: {
        projectId: { in: ids },
        NOT: { status: "na" },
      },
      _count: { projectId: true },
    }),
  ]);

  const inspectedMap = new Map(inspectedCounts.map((x) => [x.projectId, x._count.projectId]));
  const validMap = new Map(validCounts.map((x) => [x.projectId, x._count.projectId]));

  const projects = projectsPage.map((p) => {
    const inspected = inspectedMap.get(p.id) || 0;
    const totalTasks = validMap.get(p.id) || 0;
    const progressPercent = totalTasks > 0 ? Math.round((inspected / totalTasks) * 100) : 0;

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      customerName: p.customerName,
      customerPhone: p.customerPhone,
      address: p.address,
      contractValue: Number(p.contractValue),
      startDate: p.startDate,
      expectedEndDate: p.expectedEndDate,
      status: p.status,
      projectManager: p.projectManager,
      mainEngineer: p.mainEngineer,
      progressPercent,
    };
  });

  const filters = {
    projectManagers: [] as { id: string; fullName: string }[],
    mainEngineers: [] as { id: string; fullName: string }[],
  };

  if (isAdminLike) {
    const [projectManagers, mainEngineers] = await Promise.all([
      prisma.user.findMany({
        where: { role: UserRole.admin, isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
      prisma.user.findMany({
        where: { role: UserRole.engineer, isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
    ]);

    filters.projectManagers = projectManagers;
    filters.mainEngineers = mainEngineers;
  }

  return NextResponse.json({
    projects,
    page,
    pageSize,
    total,
    totalPages,
    filters,
    role: user.role,
  });
}
