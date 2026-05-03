import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { formatUtcYmd } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { canViewReportsHub, getMorningDeadlineLabel, getNowVnTimeLabel, getVisibleProjectsForUser } from "@/lib/reports-v2";
import { getTodayDateVn } from "@/lib/task-centric";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canViewReportsHub(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const reportDate = getTodayDateVn();
  const projects = await getVisibleProjectsForUser({ id: user.id, role: user.role });

  if (projects.length === 0) {
    return NextResponse.json({
      date: formatUtcYmd(reportDate),
      currentTime: getNowVnTimeLabel(),
      morningDeadline: getMorningDeadlineLabel(),
      projects: [],
    });
  }

  const checkinOwnerByProject = new Map(
    projects.map((project) => [project.id, user.role === "engineer" ? user.id : project.mainEngineerId]),
  );

  const projectIds = projects.map((project) => project.id);
  const ownerIds = Array.from(new Set(Array.from(checkinOwnerByProject.values())));

  const checkins = await prisma.morningCheckin.findMany({
    where: {
      projectId: { in: projectIds },
      userId: { in: ownerIds },
      reportDate,
    },
    select: {
      id: true,
      projectId: true,
      userId: true,
      submittedAt: true,
      isLate: true,
      tasks: {
        select: {
          taskId: true,
        },
      },
    },
  });

  const checkinMap = new Map(checkins.map((row) => [`${row.projectId}:${row.userId}`, row]));

  const allPickedTaskIds = Array.from(
    new Set(
      checkins.flatMap((row) => row.tasks.map((task) => task.taskId)),
    ),
  );

  const reportTaskRows = allPickedTaskIds.length
    ? await prisma.taskTechnicalReport.findMany({
        where: {
          reportDate,
          taskId: { in: allPickedTaskIds },
        },
        select: { taskId: true },
      })
    : [];

  const reportedTaskSet = new Set(reportTaskRows.map((row) => row.taskId));

  return NextResponse.json({
    date: formatUtcYmd(reportDate),
    currentTime: getNowVnTimeLabel(),
    morningDeadline: getMorningDeadlineLabel(),
    projects: projects.map((project) => {
      const ownerId = checkinOwnerByProject.get(project.id) || user.id;
      const checkin = checkinMap.get(`${project.id}:${ownerId}`);
      const pickedTaskIds = checkin?.tasks.map((task) => task.taskId) || [];
      const totalPicked = pickedTaskIds.length;
      const totalUpdated = pickedTaskIds.filter((taskId) => reportedTaskSet.has(taskId)).length;

      return {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        morning: {
          submitted: Boolean(checkin),
          submittedAt: checkin?.submittedAt?.toISOString() || null,
          isLate: checkin?.isLate || false,
          tasksPicked: totalPicked,
        },
        evening: {
          totalPicked,
          totalUpdated,
          completed: totalPicked > 0 && totalUpdated === totalPicked,
        },
      };
    }),
  });
}
