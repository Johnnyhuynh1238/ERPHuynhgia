import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { parseMonthInput, parseYmdToUtcDate, toUtcEndOfDay, toUtcStartOfDay } from "@/lib/date";
import { calculateKpiForProjectEngineer, calculateKpiHistoryForMonths, getActiveKpiSettings } from "@/lib/kpi";
import { getReportProjectIdsForEngineer, toProjectAccessWhere } from "@/lib/reporting";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.engineer && user.role !== UserRole.construction_manager) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const monthInput = searchParams.get("month");
  const projectIdInput = searchParams.get("projectId");
  const fromInput = searchParams.get("from");
  const toInput = searchParams.get("to");

  const parsedMonth = parseMonthInput(monthInput, { rejectInvalid: true });
  if (!parsedMonth) {
    return NextResponse.json({ message: "month không hợp lệ, định dạng đúng: YYYY-MM" }, { status: 400 });
  }

  const { month, start: monthStart, end: monthEnd } = parsedMonth;

  const hasFromInput = Boolean(fromInput && /^\d{4}-\d{2}-\d{2}$/.test(fromInput));
  const hasToInput = Boolean(toInput && /^\d{4}-\d{2}-\d{2}$/.test(toInput));

  const start = hasFromInput ? toUtcStartOfDay(parseYmdToUtcDate(fromInput as string)) : monthStart;
  const end = hasToInput ? toUtcEndOfDay(parseYmdToUtcDate(toInput as string)) : monthEnd;

  if (start > end) {
    return NextResponse.json({ message: "Khoảng thời gian không hợp lệ" }, { status: 400 });
  }

  const activeSettings = await getActiveKpiSettings(month);

  const accessibleProjects = await prisma.project.findMany({
    where: {
      id: projectIdInput || undefined,
      ...toProjectAccessWhere({ id: user.id, role: user.role }),
      goLiveDate: { not: null },
    },
    select: {
      id: true,
      code: true,
      name: true,
      goLiveDate: true,
      mainEngineerId: true,
    },
    orderBy: { code: "asc" },
  });

  if (!accessibleProjects.length) {
    return NextResponse.json({
      month,
      projects: [],
      selectedProjectId: null,
      totals: {
        score: 0,
        rank: "D",
      },
      breakdown: {
        schedule: 0,
        qc: 0,
        report: 0,
        customer: 0,
        contribution: 0,
      },
      detail: {
        requiredDays: 0,
        morningOnTimeDays: 0,
        eveningOnTimeDays: 0,
        totalCompletedTasks: 0,
        onScheduleTasks: 0,
        totalEvening: 0,
        metOrOverCount: 0,
        totalInspected: 0,
        inspectedPassFirstTime: 0,
        proactivityRaw: 0,
      },
      range: {
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      },
      history: [],
      weights: activeSettings.weights,
      settings: activeSettings,
      dailyRows: [],
    });
  }

  let selectedProjectId = projectIdInput || null;
  if (!selectedProjectId || !accessibleProjects.some((project) => project.id === selectedProjectId)) {
    selectedProjectId = accessibleProjects[0].id;
  }

  const selectedProject = accessibleProjects.find((project) => project.id === selectedProjectId);
  if (!selectedProject) {
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  let reporterId = user.id;
  if (user.role === UserRole.construction_manager) {
    reporterId = selectedProject.mainEngineerId;
  }

  if (user.role === UserRole.engineer) {
    const engineerProjectIds = await getReportProjectIdsForEngineer(user.id);
    if (!engineerProjectIds.includes(selectedProjectId)) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
  }

  const [kpi, history] = await Promise.all([
    calculateKpiForProjectEngineer({
      projectId: selectedProjectId,
      reporterId,
      from: start,
      to: end,
    }),
    calculateKpiHistoryForMonths({
      projectId: selectedProjectId,
      reporterId,
      monthStart: start,
      months: 6,
    }),
  ]);

  const activeDays = await prisma.morningReport.findMany({
    where: {
      projectId: selectedProjectId,
      reporterId,
      reportDate: { gte: start, lte: end },
    },
    select: {
      reportDate: true,
      submittedAt: true,
      isOnTime: true,
    },
    orderBy: { reportDate: "asc" },
  });

  const eveningByDate = await prisma.eveningReport.findMany({
    where: {
      projectId: selectedProjectId,
      reporterId,
      reportDate: { gte: start, lte: end },
    },
    select: {
      reportDate: true,
      submittedAt: true,
      isOnTime: true,
      overallRating: true,
    },
  });

  const eveningMap = new Map(eveningByDate.map((row) => [row.reportDate.toISOString().slice(0, 10), row]));

  return NextResponse.json({
    month,
    range: {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    },
    projects: accessibleProjects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      goLiveDate: project.goLiveDate?.toISOString() || null,
      mainEngineerId: project.mainEngineerId,
    })),
    selectedProjectId,
    totals: {
      score: kpi.score,
      rank: kpi.rank,
    },
    weights: kpi.weights,
    settings: kpi.settings,
    breakdown: kpi.scores,
    detail: kpi.detail,
    history,
    dailyRows: activeDays.map((morning) => {
      const dateKey = morning.reportDate.toISOString().slice(0, 10);
      const evening = eveningMap.get(dateKey);
      return {
        date: dateKey,
        morningSubmitted: Boolean(morning.submittedAt),
        morningOnTime: Boolean(morning.submittedAt && morning.isOnTime),
        eveningSubmitted: Boolean(evening?.submittedAt),
        eveningOnTime: Boolean(evening?.submittedAt && evening?.isOnTime),
        overallRating: evening?.overallRating || null,
      };
    }),
  });
}
