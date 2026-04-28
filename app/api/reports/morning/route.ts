import { NextResponse } from "next/server";
import { PauseReason, ReportDecision, TaskStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  canCreateProjectReport,
  createBulkTaskLogs,
  getMorningTaskGroups,
  getReportProjectForUser,
  getSiteRestDay,
  isProjectGoLive,
  normalizeReportDate,
  validateMorningTaskInput,
} from "@/lib/reporting";
import { getMorningDeadline } from "@/lib/reporting";
import { toUtcStartOfDay } from "@/lib/date";

const taskInputSchema = z.object({
  taskId: z.string().uuid(),
  decision: z.nativeEnum(ReportDecision),
  plannedActivity: z.string().optional().nullable(),
  pauseReason: z.nativeEnum(PauseReason).optional().nullable(),
  pauseNote: z.string().optional().nullable(),
});

const createSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  overallNote: z.string().optional().nullable(),
  tasks: z.array(taskInputSchema),
  submit: z.boolean().default(true),
});

const deleteSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

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

  const report = await prisma.morningReport.findUnique({
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
  });

  return NextResponse.json({ report });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const reportDate = normalizeReportDate(parsed.data.reportDate);
  const project = await getReportProjectForUser(parsed.data.projectId, { id: user.id, role: user.role });
  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const canCreate = canCreateProjectReport({ id: user.id, role: user.role }, project);
  if (!canCreate && user.role !== UserRole.engineer) {
    return NextResponse.json({ message: "Không có quyền tạo báo cáo sáng" }, { status: 403 });
  }

  if (!isProjectGoLive(project, reportDate)) {
    return NextResponse.json({ message: "Dự án chưa go-live" }, { status: 400 });
  }

  const siteRest = await getSiteRestDay(project.id, reportDate);
  if (siteRest) {
    return NextResponse.json({ message: "Công trường nghỉ, không cần báo cáo" }, { status: 400 });
  }

  const uniqueTaskIds = Array.from(new Set(parsed.data.tasks.map((task) => task.taskId)));
  if (!uniqueTaskIds.length) {
    return NextResponse.json({ message: "Danh sách task rỗng" }, { status: 400 });
  }

  const allowedTasks = await getMorningTaskGroups(project.id, reportDate);
  const allowedTaskIdSet = new Set(allowedTasks.map((task) => task.id));

  const hasInvalidTask = uniqueTaskIds.some((taskId) => !allowedTaskIdSet.has(taskId));
  if (hasInvalidTask) {
    return NextResponse.json({ message: "Có task không hợp lệ trong báo cáo" }, { status: 400 });
  }

  for (const taskInput of parsed.data.tasks) {
    const error = validateMorningTaskInput(taskInput);
    if (error) {
      return NextResponse.json({ message: error }, { status: 400 });
    }
  }

  const now = new Date();
  const deadline = getMorningDeadline(reportDate);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.morningReport.findUnique({
      where: {
        projectId_reportDate_reporterId: {
          projectId: project.id,
          reportDate: toUtcStartOfDay(reportDate),
          reporterId: user.id,
        },
      },
      select: {
        id: true,
      },
    });

    const report = existing
      ? await tx.morningReport.update({
          where: { id: existing.id },
          data: {
            overallNote: parsed.data.overallNote || null,
            submittedAt: parsed.data.submit ? now : null,
            isOnTime: parsed.data.submit ? now <= deadline : false,
          },
        })
      : await tx.morningReport.create({
          data: {
            projectId: project.id,
            reporterId: user.id,
            reportDate: toUtcStartOfDay(reportDate),
            submittedAt: parsed.data.submit ? now : null,
            isOnTime: parsed.data.submit ? now <= deadline : false,
            overallNote: parsed.data.overallNote || null,
          },
        });

    await tx.morningReportTask.deleteMany({ where: { morningReportId: report.id } });

    await tx.morningReportTask.createMany({
      data: parsed.data.tasks.map((task) => ({
        morningReportId: report.id,
        taskId: task.taskId,
        decision: task.decision,
        plannedActivity: task.decision === ReportDecision.WORK ? task.plannedActivity?.trim() || null : null,
        pauseReason: task.decision === ReportDecision.PAUSE ? task.pauseReason || null : null,
        pauseNote: task.decision === ReportDecision.PAUSE ? task.pauseNote?.trim() || null : null,
      })),
    });

    if (parsed.data.submit) {
      const workTaskIds = Array.from(
        new Set(parsed.data.tasks.filter((task) => task.decision === ReportDecision.WORK).map((task) => task.taskId)),
      );

      if (workTaskIds.length > 0) {
        const shouldPromoteStatuses: TaskStatus[] = [TaskStatus.not_started];

        const tasksToPromote = await tx.task.findMany({
          where: {
            id: { in: workTaskIds },
            status: { in: shouldPromoteStatuses },
          },
          select: {
            id: true,
            actualStartDate: true,
          },
        });

        for (const task of tasksToPromote) {
          await tx.task.update({
            where: { id: task.id },
            data: {
              status: TaskStatus.in_progress,
              actualStartDate: task.actualStartDate ?? toUtcStartOfDay(reportDate),
            },
          });
        }
      }
    }

    if (existing && parsed.data.submit) {
      await createBulkTaskLogs(uniqueTaskIds, user.id, "Đã chỉnh sửa báo cáo sáng trong ngày", "report_edit");
    }

    return report;
  });

  return NextResponse.json({ report: result, message: parsed.data.submit ? "Đã chốt báo cáo sáng" : "Đã lưu tạm báo cáo sáng" });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const reportDate = normalizeReportDate(parsed.data.reportDate);
  const project = await getReportProjectForUser(parsed.data.projectId, { id: user.id, role: user.role });
  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const canCreate = canCreateProjectReport({ id: user.id, role: user.role }, project);
  if (!canCreate && user.role !== UserRole.engineer) {
    return NextResponse.json({ message: "Không có quyền xoá báo cáo sáng" }, { status: 403 });
  }

  const report = await prisma.morningReport.findUnique({
    where: {
      projectId_reportDate_reporterId: {
        projectId: project.id,
        reportDate: toUtcStartOfDay(reportDate),
        reporterId: user.id,
      },
    },
    select: {
      id: true,
      submittedAt: true,
    },
  });

  if (!report) {
    return NextResponse.json({ message: "Không tìm thấy báo cáo sáng" }, { status: 404 });
  }

  if (report.submittedAt) {
    return NextResponse.json({ message: "Báo cáo đã chốt, không thể xoá" }, { status: 400 });
  }

  await prisma.morningReport.delete({ where: { id: report.id } });

  return NextResponse.json({ message: "Đã xoá báo cáo sáng" });
}
