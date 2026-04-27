import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { parseMonthInput } from "@/lib/date";
import { calculateKpiForProjectEngineer } from "@/lib/kpi";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { parseKpiRoleFilter } from "@/lib/reporting";
import { prisma } from "@/lib/prisma";

function canViewKpiUsers(role: string) {
  return role === UserRole.admin || role === UserRole.accountant || role === UserRole.construction_manager;
}

type KpiBreakdown = {
  morningOnTime: number;
  eveningOnTime: number;
  taskOnSchedule: number;
  dailyPlanMet: number;
  inspectionQuality: number;
  reportProactivity: number;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!canViewKpiUsers(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const monthInput = searchParams.get("month");
  const projectId = searchParams.get("projectId");
  const roleFilter = searchParams.get("role");

  const parsedMonth = parseMonthInput(monthInput, { rejectInvalid: true });
  if (!parsedMonth) {
    return NextResponse.json({ message: "month không hợp lệ, định dạng đúng: YYYY-MM" }, { status: 400 });
  }

  const { month, start, end } = parsedMonth;

  const allowedRoleFilter = parseKpiRoleFilter(roleFilter);
  if (roleFilter && !allowedRoleFilter) {
    return NextResponse.json({ message: "role không hợp lệ, chỉ hỗ trợ engineer|construction_manager" }, { status: 400 });
  }

  const projectAccess = buildProjectAccessWhere({ id: user.id, role: user.role });

  const projects = await prisma.project.findMany({
    where: {
      ...projectAccess,
      ...(projectId ? { id: projectId } : {}),
      goLiveDate: { not: null },
    },
    select: {
      id: true,
      code: true,
      name: true,
      mainEngineerId: true,
      projectManagerId: true,
      goLiveDate: true,
    },
    orderBy: { code: "asc" },
  });

  if (!projects.length) {
    return NextResponse.json({
      month,
      canSeeDetail: user.role !== UserRole.accountant,
      rows: [],
      projects: [],
    });
  }

  const targetUserIds = new Set<string>();
  for (const project of projects) {
    if (!allowedRoleFilter || allowedRoleFilter === UserRole.engineer) {
      targetUserIds.add(project.mainEngineerId);
    }
    if (!allowedRoleFilter || allowedRoleFilter === UserRole.construction_manager) {
      targetUserIds.add(project.projectManagerId);
    }
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: Array.from(targetUserIds) },
      isActive: true,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
    },
  });

  const userMap = new Map(users.map((row) => [row.id, row]));
  const canSeeDetail = user.role !== UserRole.accountant;

  const rows: Array<{
    userId: string;
    fullName: string;
    email: string;
    role: UserRole;
    projectId: string;
    projectCode: string;
    projectName: string;
    score: number;
    rank: string;
    breakdown?: KpiBreakdown;
  }> = [];

  for (const project of projects) {
    const candidateReporters: string[] = [];

    if (!allowedRoleFilter || allowedRoleFilter === UserRole.engineer) {
      candidateReporters.push(project.mainEngineerId);
    }

    if (!allowedRoleFilter || allowedRoleFilter === UserRole.construction_manager) {
      candidateReporters.push(project.projectManagerId);
    }

    for (const reporterId of candidateReporters) {
      const info = userMap.get(reporterId);
      if (!info) continue;

      const kpi = await calculateKpiForProjectEngineer({
        projectId: project.id,
        reporterId,
        from: start,
        to: end,
      });

      rows.push({
        userId: reporterId,
        fullName: info.fullName,
        email: info.email,
        role: info.role,
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        score: kpi.score,
        rank: kpi.rank,
        ...(canSeeDetail ? { breakdown: kpi.breakdown } : {}),
      });
    }
  }

  rows.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    month,
    canSeeDetail,
    rows,
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      goLiveDate: project.goLiveDate?.toISOString() || null,
    })),
  });
}
