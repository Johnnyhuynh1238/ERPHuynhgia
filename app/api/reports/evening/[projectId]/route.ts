import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { formatUtcYmd } from "@/lib/date";
import { canAccessProjectReports, getMorningTaskCandidates, getProjectForReports } from "@/lib/reports-v2";
import { prisma } from "@/lib/prisma";
import { getTodayDateVn } from "@/lib/task-centric";

type Params = { params: { projectId: string } };

function scoreFromCriteria(input: {
  morningOnTime: boolean;
  morningComplete: boolean;
  eveningOnTime: boolean | null;
  eveningComplete: boolean;
}) {
  let score = 0;
  if (input.morningOnTime) score += 30;
  if (input.morningComplete) score += 20;
  if (input.eveningOnTime === true) score += 30;
  if (input.eveningComplete) score += 20;
  return score;
}

export async function GET(_: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await canAccessProjectReports({
    userId: user.id,
    role: user.role,
    projectId: params.projectId,
  });

  if (!hasAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await getProjectForReports(params.projectId);
  if (!project) {
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  const reportDate = getTodayDateVn();
  const checkinUserId = user.role === UserRole.engineer ? user.id : project.mainEngineerId;

  const checkin = await prisma.morningCheckin.findUnique({
    where: {
      userId_projectId_reportDate: {
        userId: checkinUserId,
        projectId: params.projectId,
        reportDate,
      },
    },
    select: {
      id: true,
      submittedAt: true,
      isLate: true,
      tasks: {
        select: {
          taskId: true,
          task: {
            select: {
              code: true,
              name: true,
              phase: true,
            },
          },
        },
      },
    },
  });

  if (!checkin || checkin.tasks.length === 0) {
    return NextResponse.json({
      summary: {
        totalPicked: 0,
        totalUpdated: 0,
        allCompleted: false,
        completionRate: 0,
      },
      tasks: [],
      kpiToday: {
        morningOnTime: false,
        morningComplete: false,
        eveningOnTime: null,
        eveningComplete: false,
        currentScore: 0,
      },
    });
  }

  const pickedTaskIds = checkin.tasks.map((item) => item.taskId);
  const [technicalReports, candidates] = await Promise.all([
    prisma.taskTechnicalReport.findMany({
      where: {
        taskId: { in: pickedTaskIds },
        reportDate,
      },
      select: {
        taskId: true,
        status: true,
        updatedAt: true,
        photos: {
          select: { id: true },
        },
      },
    }),
    getMorningTaskCandidates(params.projectId, reportDate),
  ]);

  const reportByTask = new Map(technicalReports.map((row) => [row.taskId, row]));
  const totalPicked = pickedTaskIds.length;
  const totalUpdated = technicalReports.length;
  const allCompleted = totalPicked > 0 && totalUpdated === totalPicked;
  const completionRate = totalPicked === 0 ? 0 : Math.round((totalUpdated / totalPicked) * 100);

  const requiredIds = candidates.filter((row) => row.group === "in_progress" || row.group === "overdue").map((row) => row.taskId);
  const pickedSet = new Set(pickedTaskIds);
  const morningComplete = requiredIds.length === 0 || requiredIds.every((taskId) => pickedSet.has(taskId));

  const eveningDeadline = new Date(`${formatUtcYmd(reportDate)}T19:00:00+07:00`);
  const eveningOnTime = allCompleted ? technicalReports.every((row) => row.updatedAt.getTime() <= eveningDeadline.getTime()) : null;

  const morningOnTime = !checkin.isLate;

  const tasks = checkin.tasks
    .map((item) => {
      const report = reportByTask.get(item.taskId);
      const progress = report
        ? report.status === "completed"
          ? 100
          : report.status === "working"
            ? 60
            : 0
        : null;

      return {
        taskId: item.taskId,
        taskCode: item.task.code,
        taskName: item.task.name,
        phase: item.task.phase,
        report: {
          exists: Boolean(report),
          status: report?.status ?? null,
          progress,
          photoCount: report?.photos.length ?? 0,
          lastUpdatedAt: report?.updatedAt?.toISOString() ?? null,
        },
      };
    })
    .sort((a, b) => a.taskCode.localeCompare(b.taskCode, "vi", { numeric: true }));

  return NextResponse.json({
    summary: {
      totalPicked,
      totalUpdated,
      allCompleted,
      completionRate,
    },
    tasks,
    kpiToday: {
      morningOnTime,
      morningComplete,
      eveningOnTime,
      eveningComplete: allCompleted,
      currentScore: scoreFromCriteria({
        morningOnTime,
        morningComplete,
        eveningOnTime,
        eveningComplete: allCompleted,
      }),
    },
  });
}
