import { NextResponse } from "next/server";
import { ReportDecision, TaskStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { normalizeReportDate, getReportProjectForUser, getSiteRestDay, isProjectGoLive, getMorningTaskGroups, getPreviousMorningTaskDecision, canCreateProjectReport } from "@/lib/reporting";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const dateInput = searchParams.get("date");

  if (!projectId) {
    return NextResponse.json({ message: "Thiếu projectId" }, { status: 400 });
  }

  const reportDate = normalizeReportDate(dateInput);
  const project = await getReportProjectForUser(projectId, { id: user.id, role: user.role });
  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const canCreate = canCreateProjectReport({ id: user.id, role: user.role }, project);
  if (!canCreate && user.role !== UserRole.engineer) {
    return NextResponse.json({ message: "Không có quyền tạo báo cáo sáng" }, { status: 403 });
  }

  const [siteRestDay, morningReport] = await Promise.all([
    getSiteRestDay(projectId, reportDate),
    // Reporter mặc định theo user hiện tại
    (async () => {
      const reporterId = user.id;
      return await (await import("@/lib/prisma")).prisma.morningReport.findUnique({
        where: {
          projectId_reportDate_reporterId: {
            projectId,
            reportDate,
            reporterId,
          },
        },
        include: {
          taskReports: true,
        },
      });
    })(),
  ]);

  const goLive = isProjectGoLive(project, reportDate);
  if (!goLive) {
    return NextResponse.json({
      project,
      reportDate,
      isGoLive: false,
      siteRestDay,
      morningReport,
      tasks: [],
    });
  }

  if (siteRestDay) {
    return NextResponse.json({
      project,
      reportDate,
      isGoLive: true,
      siteRestDay,
      morningReport,
      tasks: [],
    });
  }

  const groupedTasks = await getMorningTaskGroups(projectId, reportDate);

  const tasksWithPrefill = await Promise.all(
    groupedTasks.map(async (task) => {
      const current = morningReport?.taskReports.find((row) => row.taskId === task.id);
      if (current) {
        return {
          ...task,
          decision: current.decision,
          plannedActivity: current.plannedActivity,
          pauseReason: current.pauseReason,
          pauseNote: current.pauseNote,
        };
      }

      const previous = await getPreviousMorningTaskDecision(projectId, task.id, reportDate);
      if (!previous) {
        return {
          ...task,
          decision: ReportDecision.WORK,
          plannedActivity: "",
          pauseReason: null,
          pauseNote: "",
        };
      }

      return {
        ...task,
        decision: previous.decision,
        plannedActivity: previous.plannedActivity || "",
        pauseReason: previous.pauseReason,
        pauseNote: previous.pauseNote || "",
      };
    }),
  );

  return NextResponse.json({
    project,
    reportDate,
    isGoLive: true,
    siteRestDay,
    morningReport,
    tasks: tasksWithPrefill.sort((a, b) => {
      if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
      if (a.group === "A" && b.group === "A" && a.overdueDays !== b.overdueDays) {
        return b.overdueDays - a.overdueDays;
      }
      return a.code.localeCompare(b.code, "vi");
    }),
  });
}
