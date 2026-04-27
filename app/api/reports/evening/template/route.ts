import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { normalizeReportDate, getReportProjectForUser, getSiteRestDay, isProjectGoLive } from "@/lib/reporting";

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

  if (!isProjectGoLive(project, reportDate)) {
    return NextResponse.json({
      project,
      reportDate,
      isGoLive: false,
      siteRestDay: null,
      morningReport: null,
      eveningReport: null,
      tasks: [],
    });
  }

  const [siteRestDay, morningReport, eveningReport] = await Promise.all([
    getSiteRestDay(projectId, reportDate),
    prisma.morningReport.findUnique({
      where: {
        projectId_reportDate_reporterId: {
          projectId,
          reportDate,
          reporterId: user.id,
        },
      },
      include: {
        taskReports: {
          include: {
            task: {
              select: {
                id: true,
                code: true,
                name: true,
                phase: true,
                status: true,
              },
            },
          },
        },
      },
    }),
    prisma.eveningReport.findUnique({
      where: {
        projectId_reportDate_reporterId: {
          projectId,
          reportDate,
          reporterId: user.id,
        },
      },
      include: {
        taskReports: {
          include: {
            taskPhotos: {
              select: {
                id: true,
                taskId: true,
                photoUrl: true,
                thumbnailUrl: true,
                caption: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
        sitePhotos: true,
      },
    }),
  ]);

  if (siteRestDay) {
    return NextResponse.json({
      project,
      reportDate,
      isGoLive: true,
      siteRestDay,
      morningReport,
      eveningReport,
      tasks: [],
    });
  }

  if (!morningReport?.submittedAt) {
    return NextResponse.json(
      {
        message: "Phải có báo cáo sáng trước khi báo cáo chiều",
        project,
        reportDate,
        requiresMorning: true,
      },
      { status: 409 },
    );
  }

  const rows = morningReport.taskReports.map((taskRow) => {
    const existing = eveningReport?.taskReports.find((x) => x.taskId === taskRow.taskId);
    return {
      taskId: taskRow.task.id,
      code: taskRow.task.code,
      name: taskRow.task.name,
      phase: taskRow.task.phase,
      decision: taskRow.decision,
      plannedActivity: taskRow.plannedActivity,
      pauseReason: taskRow.pauseReason,
      pauseNote: taskRow.pauseNote,
      completionPercent: existing?.completionPercent ?? null,
      actualWork: existing?.actualWork ?? "",
      issues: existing?.issues ?? "",
      rating: existing?.rating ?? null,
      explanation: existing?.explanation ?? "",
      stillPaused: existing?.stillPaused ?? null,
      actualWorkIfStarted: existing?.actualWorkIfStarted ?? "",
      taskPhotoIds: existing?.taskPhotos.map((photo) => photo.id) ?? [],
      taskPhotos: existing?.taskPhotos ?? [],
      eveningTaskId: existing?.id ?? null,
    };
  });

  return NextResponse.json({
    project,
    reportDate,
    isGoLive: true,
    siteRestDay,
    morningReport,
    eveningReport,
    tasks: rows,
  });
}
