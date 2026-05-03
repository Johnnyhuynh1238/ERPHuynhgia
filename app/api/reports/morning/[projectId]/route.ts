import { NextResponse } from "next/server";
import { TaskStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getMorningTaskCandidates, canAccessProjectReports, defaultSelectedTaskIds, getProjectForReports, isMorningLate, sortByTaskCode } from "@/lib/reports-v2";
import { getTodayDateVn } from "@/lib/task-centric";
import { prisma } from "@/lib/prisma";

type Params = { params: { projectId: string } };

function toGroupedResponse(rows: Awaited<ReturnType<typeof getMorningTaskCandidates>>) {
  return {
    overdue: sortByTaskCode(rows.filter((row) => row.group === "overdue")),
    in_progress: sortByTaskCode(rows.filter((row) => row.group === "in_progress")),
    starting_today: sortByTaskCode(rows.filter((row) => row.group === "starting_today")),
    upcoming: sortByTaskCode(rows.filter((row) => row.group === "upcoming")),
  };
}

function normalizeTaskIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const ids = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set(ids));
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

  const [candidates, checkin] = await Promise.all([
    getMorningTaskCandidates(params.projectId, reportDate),
    prisma.morningCheckin.findUnique({
      where: {
        userId_projectId_reportDate: {
          userId: checkinUserId,
          projectId: params.projectId,
          reportDate,
        },
      },
      select: {
        submittedAt: true,
        isLate: true,
        tasks: {
          select: {
            taskId: true,
          },
        },
      },
    }),
  ]);

  const selectedTaskIds = checkin
    ? checkin.tasks.map((row) => row.taskId)
    : defaultSelectedTaskIds(candidates);

  return NextResponse.json({
    checkin: {
      exists: Boolean(checkin),
      submittedAt: checkin?.submittedAt?.toISOString() || null,
      isLate: checkin?.isLate || false,
      selectedTaskIds,
    },
    groups: toGroupedResponse(candidates),
  });
}

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== UserRole.engineer) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const hasAccess = await canAccessProjectReports({
    userId: user.id,
    role: user.role,
    projectId: params.projectId,
  });

  if (!hasAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const reportDate = getTodayDateVn();
  const now = new Date();
  const body = await request.json().catch(() => ({}));
  const taskIds = normalizeTaskIds(body?.taskIds);

  const existed = await prisma.morningCheckin.findUnique({
    where: {
      userId_projectId_reportDate: {
        userId: user.id,
        projectId: params.projectId,
        reportDate,
      },
    },
    select: { id: true },
  });

  if (existed) {
    return NextResponse.json({ message: "Đã báo cáo sáng rồi, dùng PATCH để sửa" }, { status: 409 });
  }

  const candidates = await getMorningTaskCandidates(params.projectId, reportDate);
  const candidateMap = new Map(candidates.map((row) => [row.taskId, row]));
  const invalidTaskId = taskIds.find((taskId) => !candidateMap.has(taskId));

  if (invalidTaskId) {
    return NextResponse.json({ message: "Có task không thuộc danh sách báo cáo sáng" }, { status: 400 });
  }

  const checkin = await prisma.$transaction(async (tx) => {
    const created = await tx.morningCheckin.create({
      data: {
        userId: user.id,
        projectId: params.projectId,
        reportDate,
        submittedAt: now,
        isLate: isMorningLate(now, reportDate),
        tasks: {
          create: taskIds.map((taskId) => ({
            taskId,
            taskGroup: candidateMap.get(taskId)?.group || "upcoming",
          })),
        },
      },
      select: {
        id: true,
        submittedAt: true,
        isLate: true,
      },
    });

    if (taskIds.length > 0) {
      await tx.task.updateMany({
        where: {
          id: { in: taskIds },
          projectId: params.projectId,
          actualStartDate: null,
        },
        data: {
          actualStartDate: reportDate,
        },
      });

      await tx.task.updateMany({
        where: {
          id: { in: taskIds },
          projectId: params.projectId,
          status: TaskStatus.not_started,
        },
        data: {
          status: TaskStatus.in_progress,
        },
      });

      await tx.taskLog.createMany({
        data: taskIds.map((taskId) => ({
          taskId,
          userId: user.id,
          logType: "report_edit",
          content: "Morning check-in: chọn task thực hiện hôm nay",
        })),
      });
    }

    return created;
  });

  return NextResponse.json({
    checkin: {
      id: checkin.id,
      submittedAt: checkin.submittedAt.toISOString(),
      isLate: checkin.isLate,
      taskCount: taskIds.length,
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== UserRole.engineer) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const hasAccess = await canAccessProjectReports({
    userId: user.id,
    role: user.role,
    projectId: params.projectId,
  });

  if (!hasAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const reportDate = getTodayDateVn();
  const body = await request.json().catch(() => ({}));
  const nextTaskIds = normalizeTaskIds(body?.taskIds);

  const checkin = await prisma.morningCheckin.findUnique({
    where: {
      userId_projectId_reportDate: {
        userId: user.id,
        projectId: params.projectId,
        reportDate,
      },
    },
    select: {
      id: true,
      tasks: {
        select: { taskId: true },
      },
    },
  });

  if (!checkin) {
    return NextResponse.json({ message: "Chưa có báo cáo sáng, dùng POST" }, { status: 404 });
  }

  const candidates = await getMorningTaskCandidates(params.projectId, reportDate);
  const candidateMap = new Map(candidates.map((row) => [row.taskId, row]));
  const invalidTaskId = nextTaskIds.find((taskId) => !candidateMap.has(taskId));

  if (invalidTaskId) {
    return NextResponse.json({ message: "Có task không thuộc danh sách báo cáo sáng" }, { status: 400 });
  }

  const oldTaskIds = checkin.tasks.map((row) => row.taskId);
  const toAdd = nextTaskIds.filter((taskId) => !oldTaskIds.includes(taskId));
  const toRemove = oldTaskIds.filter((taskId) => !nextTaskIds.includes(taskId));

  await prisma.$transaction(async (tx) => {
    if (toAdd.length > 0) {
      await tx.morningCheckinTask.createMany({
        data: toAdd.map((taskId) => ({
          checkinId: checkin.id,
          taskId,
          taskGroup: candidateMap.get(taskId)?.group || "upcoming",
        })),
      });

      await tx.task.updateMany({
        where: {
          id: { in: toAdd },
          projectId: params.projectId,
          actualStartDate: null,
        },
        data: {
          actualStartDate: reportDate,
        },
      });

      await tx.task.updateMany({
        where: {
          id: { in: toAdd },
          projectId: params.projectId,
          status: TaskStatus.not_started,
        },
        data: {
          status: TaskStatus.in_progress,
        },
      });
    }

    if (toRemove.length > 0) {
      await tx.morningCheckinTask.deleteMany({
        where: {
          checkinId: checkin.id,
          taskId: { in: toRemove },
        },
      });
    }

    await tx.morningCheckin.update({
      where: { id: checkin.id },
      data: {
        lastUpdatedAt: new Date(),
      },
    });

    if (toAdd.length > 0 || toRemove.length > 0) {
      const touchedIds = Array.from(new Set([...toAdd, ...toRemove]));
      await tx.taskLog.createMany({
        data: touchedIds.map((taskId) => ({
          taskId,
          userId: user.id,
          logType: "report_edit",
          content: `Morning check-in updated: +${toAdd.length}, -${toRemove.length}`,
        })),
      });
    }
  });

  return NextResponse.json({
    ok: true,
    added: toAdd.length,
    removed: toRemove.length,
    taskCount: nextTaskIds.length,
  });
}
