import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { formatUtcYmd, nowUtcDateOnly } from "@/lib/date";
import { createTaskLog, getReminderTargetProjects } from "@/lib/reporting";
import { prisma } from "@/lib/prisma";

function minuteOfDayInVietnam(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function isInternalJobAllowed(request: Request, userRole: string | null | undefined) {
  if (userRole === UserRole.admin || userRole === UserRole.construction_manager) {
    return true;
  }

  const expectedSecret = process.env.INTERNAL_JOB_SECRET;
  if (!expectedSecret) return false;

  const providedSecret = request.headers.get("x-internal-job-secret");
  return Boolean(providedSecret && providedSecret === expectedSecret);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!isInternalJobAllowed(request, user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const now = new Date();
  const today = nowUtcDateOnly();
  const currentMinuteOfDay = minuteOfDayInVietnam(now);

  const mode: "morning" | "evening" = currentMinuteOfDay >= 19 * 60 ? "evening" : "morning";

  const expectedTimes = {
    morning: "08:00",
    evening: "19:00",
  } as const;

  const executedAt = `${String(Math.floor(currentMinuteOfDay / 60)).padStart(2, "0")}:${String(currentMinuteOfDay % 60).padStart(2, "0")}`;

  const projects = await getReminderTargetProjects();
  if (!projects.length) {
    return NextResponse.json({
      mode,
      date: formatUtcYmd(today),
      reminders: 0,
      skippedRest: 0,
      skippedSubmitted: 0,
      scheduledAt: expectedTimes[mode],
      executedAt,
    });
  }

  const projectIds = projects.map((project) => project.id);

  const [restRows, morningRows, eveningRows] = await Promise.all([
    prisma.siteRestDay.findMany({
      where: {
        projectId: { in: projectIds },
        restDate: today,
      },
      select: { projectId: true },
    }),
    prisma.morningReport.findMany({
      where: {
        projectId: { in: projectIds },
        reportDate: today,
        submittedAt: { not: null },
      },
      select: {
        projectId: true,
        reporterId: true,
      },
    }),
    prisma.eveningReport.findMany({
      where: {
        projectId: { in: projectIds },
        reportDate: today,
        submittedAt: { not: null },
      },
      select: {
        projectId: true,
        reporterId: true,
      },
    }),
  ]);

  const restSet = new Set(restRows.map((row) => row.projectId));
  const submittedMorningSet = new Set(morningRows.map((row) => `${row.projectId}_${row.reporterId}`));
  const submittedEveningSet = new Set(eveningRows.map((row) => `${row.projectId}_${row.reporterId}`));

  let reminders = 0;
  let skippedRest = 0;
  let skippedSubmitted = 0;

  for (const project of projects) {
    if (restSet.has(project.id)) {
      skippedRest += 1;
      continue;
    }

    const key = `${project.id}_${project.mainEngineerId}`;
    const alreadySubmitted = mode === "morning" ? submittedMorningSet.has(key) : submittedEveningSet.has(key);

    if (alreadySubmitted) {
      skippedSubmitted += 1;
      continue;
    }

    const taskIds = await prisma.task.findMany({
      where: {
        projectId: project.id,
        isActive: true,
      },
      select: { id: true },
    });

    await Promise.all(
      taskIds.map((task) =>
        createTaskLog(
          task.id,
          project.mainEngineerId,
          mode === "morning" ? "Nhắc nộp báo cáo sáng lúc 8:00" : "Nhắc nộp báo cáo chiều lúc 19:00",
          "reminder_sent",
        ),
      ),
    );

    reminders += 1;
  }

  return NextResponse.json({
    mode,
    date: formatUtcYmd(today),
    reminders,
    skippedRest,
    skippedSubmitted,
    scheduledAt: expectedTimes[mode],
    executedAt,
  });
}
