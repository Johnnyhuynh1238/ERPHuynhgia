import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { parseYmdToUtcDate, toUtcEndOfDay, toUtcStartOfDay } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

function mapAuthError(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

function normalizeRange(fromInput: string | null, toInput: string | null) {
  const now = new Date();
  const fallbackTo = toUtcStartOfDay(now);
  const fallbackFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30, 0, 0, 0));

  const from = fromInput && /^\d{4}-\d{2}-\d{2}$/.test(fromInput) ? parseYmdToUtcDate(fromInput) : fallbackFrom;
  const to = toInput && /^\d{4}-\d{2}-\d{2}$/.test(toInput) ? parseYmdToUtcDate(toInput) : fallbackTo;

  return {
    from: toUtcStartOfDay(from <= to ? from : to),
    to: toUtcEndOfDay(to >= from ? to : from),
  };
}

function dateKeyOf(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return mapAuthError(401, "Chưa đăng nhập");
  }

  if (user.role === UserRole.accountant) {
    return mapAuthError(403, "Không có quyền");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: {
      id: true,
      code: true,
      name: true,
      goLiveDate: true,
    },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) return mapAuthError(404, "Không tìm thấy dự án");
    return mapAuthError(403, "Không có quyền");
  }

  const { searchParams } = new URL(request.url);
  const fromInput = searchParams.get("from");
  const toInput = searchParams.get("to");
  const { from, to } = normalizeRange(fromInput, toInput);

  const whereBase = {
    projectId: params.id,
    reportDate: { gte: from, lte: to },
  };

  const [morningReports, eveningReports] = await Promise.all([
    prisma.morningReport.findMany({
      where: whereBase,
      include: {
        reporter: { select: { id: true, fullName: true } },
        taskReports: {
          select: {
            taskId: true,
            decision: true,
            plannedActivity: true,
            pauseReason: true,
            pauseNote: true,
            task: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { reportDate: "desc" },
    }),
    prisma.eveningReport.findMany({
      where: whereBase,
      include: {
        reporter: { select: { id: true, fullName: true } },
        taskReports: {
          include: {
            task: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            taskPhotos: {
              select: {
                id: true,
                photoUrl: true,
                thumbnailUrl: true,
                caption: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
        sitePhotos: {
          select: {
            id: true,
            photoUrl: true,
            thumbnailUrl: true,
            caption: true,
          },
          orderBy: { uploadedAt: "desc" },
        },
      },
      orderBy: { reportDate: "desc" },
    }),
  ]);

  const morningMap = new Map<string, (typeof morningReports)[number]>();
  for (const row of morningReports) {
    const key = dateKeyOf(row.reportDate);
    if (!morningMap.has(key)) {
      morningMap.set(key, row);
    }
  }

  const eveningMap = new Map<string, (typeof eveningReports)[number]>();
  for (const row of eveningReports) {
    const key = dateKeyOf(row.reportDate);
    if (!eveningMap.has(key)) {
      eveningMap.set(key, row);
    }
  }

  const dateKeys = Array.from(new Set([...Array.from(morningMap.keys()), ...Array.from(eveningMap.keys())])).sort((a, b) =>
    b.localeCompare(a),
  );

  const timeline = dateKeys.map((date) => {
    const morning = morningMap.get(date) || null;
    const evening = eveningMap.get(date) || null;
    const reporter = evening?.reporter || morning?.reporter || null;

    const morningTaskById = new Map((morning?.taskReports || []).map((task) => [task.taskId, task]));
    const eveningTaskById = new Map((evening?.taskReports || []).map((task) => [task.taskId, task]));

    const taskIds = new Set<string>();
    (morning?.taskReports || []).forEach((task) => {
      if (task.decision === "WORK") {
        taskIds.add(task.taskId);
      }
    });

    (evening?.taskReports || []).forEach((task) => {
      if (
        task.completionPercent !== null ||
        task.actualWork ||
        task.actualWorkIfStarted ||
        task.rating ||
        task.issues ||
        task.taskPhotos.length > 0
      ) {
        taskIds.add(task.taskId);
      }
    });

    const taskWork = Array.from(taskIds)
      .map((taskId) => {
        const morningTask = morningTaskById.get(taskId);
        const eveningTask = eveningTaskById.get(taskId);

        return {
          taskId,
          code: eveningTask?.task.code || morningTask?.task.code || "-",
          name: eveningTask?.task.name || morningTask?.task.name || "-",
          plannedActivity: morningTask?.decision === "WORK" ? (morningTask.plannedActivity || null) : null,
          completionPercent: eveningTask?.completionPercent ?? null,
          actualWork: eveningTask?.actualWork ?? null,
          actualWorkIfStarted: eveningTask?.actualWorkIfStarted ?? null,
          issues: eveningTask?.issues ?? null,
          rating: eveningTask?.rating ?? null,
          explanation: eveningTask?.explanation ?? null,
          taskPhotos: eveningTask?.taskPhotos || [],
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    const pausedTasks = (morning?.taskReports || [])
      .filter((task) => task.decision === "PAUSE")
      .map((task) => {
        const eveningTask = eveningTaskById.get(task.taskId);
        return {
          taskId: task.taskId,
          code: task.task.code,
          name: task.task.name,
          pauseReason: task.pauseReason,
          pauseNote: task.pauseNote,
          stillPaused: eveningTask?.stillPaused ?? null,
        };
      });

    return {
      date,
      reporter: reporter ? { id: reporter.id, fullName: reporter.fullName } : { id: "", fullName: "-" },
      morning: morning
        ? {
            id: morning.id,
            submittedAt: morning.submittedAt,
            isOnTime: morning.isOnTime,
            overallNote: morning.overallNote,
          }
        : null,
      evening: evening
        ? {
            id: evening.id,
            submittedAt: evening.submittedAt,
            isOnTime: evening.isOnTime,
            overallRating: evening.overallRating,
            overallNote: evening.overallNote,
            issues: evening.issues,
          }
        : null,
      taskWork,
      pausedTasks,
      sitePhotos: evening?.sitePhotos || [],
    };
  });

  return NextResponse.json({
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      goLiveDate: project.goLiveDate?.toISOString() || null,
    },
    range: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    timeline,
  });
}
