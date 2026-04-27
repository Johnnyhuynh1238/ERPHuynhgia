import { NextResponse } from "next/server";
import { DailyRating, ReportDecision, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { toUtcStartOfDay } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import {
  canCreateProjectReport,
  createBulkTaskLogs,
  fetchTaskPhotoRows,
  getEveningDeadline,
  getReportProjectForUser,
  getSiteRestDay,
  isProjectGoLive,
  normalizeReportDate,
  validateEveningTaskPauseInput,
  validateEveningTaskWorkInput,
} from "@/lib/reporting";
import { recomputeTaskStatus } from "@/lib/task-status-auto";

const taskInputSchema = z.object({
  taskId: z.string().uuid(),
  completionPercent: z.number().int().min(0).max(100).optional().nullable(),
  actualWork: z.string().optional().nullable(),
  issues: z.string().optional().nullable(),
  rating: z.nativeEnum(DailyRating).optional().nullable(),
  explanation: z.string().optional().nullable(),
  stillPaused: z.boolean().optional().nullable(),
  actualWorkIfStarted: z.string().optional().nullable(),
  taskPhotoIds: z.array(z.string().uuid()).optional().default([]),
  markAsDone: z.boolean().optional().default(false),
});

const createSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  issues: z.string().optional().nullable(),
  overallRating: z.nativeEnum(DailyRating).optional().nullable(),
  overallNote: z.string().optional().nullable(),
  tasks: z.array(taskInputSchema),
  submit: z.boolean().default(true),
});

const deleteSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

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

  const report = await prisma.eveningReport.findUnique({
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
      sitePhotos: {
        orderBy: { uploadedAt: "desc" },
      },
      morningReport: {
        include: {
          taskReports: {
            select: {
              taskId: true,
              decision: true,
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
    return NextResponse.json({ message: "Không có quyền tạo báo cáo chiều" }, { status: 403 });
  }

  if (!isProjectGoLive(project, reportDate)) {
    return NextResponse.json({ message: "Dự án chưa go-live" }, { status: 400 });
  }

  const siteRest = await getSiteRestDay(project.id, reportDate);
  if (siteRest) {
    return NextResponse.json({ message: "Công trường nghỉ, không cần báo cáo" }, { status: 400 });
  }

  if (parsed.data.tasks.length === 0) {
    return NextResponse.json({ message: "Danh sách task rỗng" }, { status: 400 });
  }

  if (parsed.data.submit && !parsed.data.overallRating) {
    return NextResponse.json({ message: "Phải chọn đánh giá tổng cuối ngày" }, { status: 400 });
  }

  const morningReport = await prisma.morningReport.findUnique({
    where: {
      projectId_reportDate_reporterId: {
        projectId: project.id,
        reportDate: toUtcStartOfDay(reportDate),
        reporterId: user.id,
      },
    },
    include: {
      taskReports: {
        select: {
          taskId: true,
          decision: true,
        },
      },
    },
  });

  if (!morningReport?.submittedAt) {
    return NextResponse.json({ message: "Phải có báo cáo sáng trước khi báo cáo chiều" }, { status: 409 });
  }

  const inputTaskIds = parsed.data.tasks.map((task) => task.taskId);
  const uniqueTaskIds = Array.from(new Set(inputTaskIds));
  if (uniqueTaskIds.length !== inputTaskIds.length) {
    return NextResponse.json({ message: "Task bị trùng trong payload" }, { status: 400 });
  }

  const morningTaskIds = morningReport.taskReports.map((task) => task.taskId);
  if (morningTaskIds.length !== uniqueTaskIds.length || morningTaskIds.some((taskId) => !uniqueTaskIds.includes(taskId))) {
    return NextResponse.json({ message: "Danh sách task phải khớp với báo cáo sáng" }, { status: 400 });
  }

  const morningDecisionByTaskId = new Map(morningReport.taskReports.map((task) => [task.taskId, task.decision]));

  for (const taskInput of parsed.data.tasks) {
    const decision = morningDecisionByTaskId.get(taskInput.taskId);
    if (!decision) {
      return NextResponse.json({ message: "Task không tồn tại trong báo cáo sáng" }, { status: 400 });
    }

    const photoRows = await fetchTaskPhotoRows(taskInput.taskId, taskInput.taskPhotoIds);
    if (photoRows.length !== taskInput.taskPhotoIds.length) {
      return NextResponse.json({ message: "Có ảnh task không hợp lệ" }, { status: 400 });
    }

    if (!parsed.data.submit) {
      continue;
    }

    if (decision === ReportDecision.WORK) {
      const error = validateEveningTaskWorkInput({
        completionPercent: taskInput.completionPercent,
        actualWork: taskInput.actualWork,
        rating: taskInput.rating,
        explanation: taskInput.explanation,
        taskPhotoIds: taskInput.taskPhotoIds,
      });
      if (error) {
        return NextResponse.json({ message: `${taskInput.taskId}: ${error}` }, { status: 400 });
      }
      continue;
    }

    const error = validateEveningTaskPauseInput({
      stillPaused: taskInput.stillPaused,
      actualWorkIfStarted: taskInput.actualWorkIfStarted,
      taskPhotoIds: taskInput.taskPhotoIds,
    });
    if (error) {
      return NextResponse.json({ message: `${taskInput.taskId}: ${error}` }, { status: 400 });
    }
  }

  const now = new Date();
  const deadline = getEveningDeadline(reportDate);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.eveningReport.findUnique({
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
        ? await tx.eveningReport.update({
            where: { id: existing.id },
            data: {
              issues: parsed.data.issues?.trim() || null,
              overallRating: parsed.data.overallRating || DailyRating.MET,
              overallNote: parsed.data.overallNote?.trim() || null,
              submittedAt: parsed.data.submit ? now : null,
              isOnTime: parsed.data.submit ? now <= deadline : false,
            },
          })
        : await tx.eveningReport.create({
            data: {
              projectId: project.id,
              reporterId: user.id,
              reportDate: toUtcStartOfDay(reportDate),
              morningReportId: morningReport.id,
              submittedAt: parsed.data.submit ? now : null,
              isOnTime: parsed.data.submit ? now <= deadline : false,
              issues: parsed.data.issues?.trim() || null,
              overallRating: parsed.data.overallRating || DailyRating.MET,
              overallNote: parsed.data.overallNote?.trim() || null,
            },
          });

      const eveningTaskIdByTaskId = new Map<string, string>();

      for (const taskInput of parsed.data.tasks) {
        const decision = morningDecisionByTaskId.get(taskInput.taskId);
        if (!decision) {
          throw new Error("Task không tồn tại trong báo cáo sáng");
        }

        const row = await tx.eveningReportTask.upsert({
          where: {
            eveningReportId_taskId: {
              eveningReportId: report.id,
              taskId: taskInput.taskId,
            },
          },
          update:
            decision === ReportDecision.WORK
              ? {
                  completionPercent: taskInput.completionPercent,
                  actualWork: taskInput.actualWork?.trim() || null,
                  issues: taskInput.issues?.trim() || null,
                  rating: taskInput.rating || null,
                  explanation: taskInput.explanation?.trim() || null,
                  stillPaused: null,
                  actualWorkIfStarted: null,
                }
              : {
                  completionPercent: null,
                  actualWork: null,
                  issues: null,
                  rating: null,
                  explanation: null,
                  stillPaused: taskInput.stillPaused,
                  actualWorkIfStarted: taskInput.actualWorkIfStarted?.trim() || null,
                },
          create:
            decision === ReportDecision.WORK
              ? {
                  eveningReportId: report.id,
                  taskId: taskInput.taskId,
                  completionPercent: taskInput.completionPercent,
                  actualWork: taskInput.actualWork?.trim() || null,
                  issues: taskInput.issues?.trim() || null,
                  rating: taskInput.rating || null,
                  explanation: taskInput.explanation?.trim() || null,
                }
              : {
                  eveningReportId: report.id,
                  taskId: taskInput.taskId,
                  stillPaused: taskInput.stillPaused,
                  actualWorkIfStarted: taskInput.actualWorkIfStarted?.trim() || null,
                },
          select: { id: true },
        });

        eveningTaskIdByTaskId.set(taskInput.taskId, row.id);
      }

      for (const taskInput of parsed.data.tasks) {
        const eveningTaskId = eveningTaskIdByTaskId.get(taskInput.taskId);
        if (!eveningTaskId) continue;

        await tx.taskPhoto.updateMany({
          where: {
            eveningReportTaskId: eveningTaskId,
          },
          data: {
            eveningReportTaskId: null,
          },
        });

        if (taskInput.taskPhotoIds.length > 0) {
          await tx.taskPhoto.updateMany({
            where: {
              id: { in: taskInput.taskPhotoIds },
              taskId: taskInput.taskId,
            },
            data: {
              eveningReportTaskId: eveningTaskId,
            },
          });
        }
      }

      if (parsed.data.submit) {
        const sitePhotoCount = await tx.eveningReportPhoto.count({
          where: {
            eveningReportId: report.id,
          },
        });

        if (sitePhotoCount < 1 || sitePhotoCount > 3) {
          throw new Error("Ảnh toàn cảnh công trường phải từ 1 đến 3 ảnh");
        }
      }

      for (const taskInput of parsed.data.tasks) {
        const decision = morningDecisionByTaskId.get(taskInput.taskId);
        if (decision !== ReportDecision.WORK) continue;

        const hasActivity = (taskInput.completionPercent ?? 0) > 0 || taskInput.taskPhotoIds.length > 0;
        if (!hasActivity) continue;

        await recomputeTaskStatus(taskInput.taskId, "evening report activity", {
          db: tx,
          actorUserId: user.id,
          forceInProgress: true,
          statusDate: toUtcStartOfDay(reportDate),
        });
      }

      if (existing && parsed.data.submit) {
        await createBulkTaskLogs(uniqueTaskIds, user.id, "Đã chỉnh sửa báo cáo chiều trong ngày", "report_edit");
      }

      return await tx.eveningReport.findUnique({
        where: { id: report.id },
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
          sitePhotos: {
            orderBy: { uploadedAt: "desc" },
          },
        },
      });
    });

    return NextResponse.json({
      report: result,
      message: parsed.data.submit ? "Đã chốt báo cáo chiều" : "Đã lưu tạm báo cáo chiều",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tạo báo cáo chiều";
    return NextResponse.json({ message }, { status: 400 });
  }
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
    return NextResponse.json({ message: "Không có quyền xoá báo cáo chiều" }, { status: 403 });
  }

  const report = await prisma.eveningReport.findUnique({
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
    return NextResponse.json({ message: "Không tìm thấy báo cáo chiều" }, { status: 404 });
  }

  if (report.submittedAt) {
    return NextResponse.json({ message: "Báo cáo đã chốt, không thể xoá" }, { status: 400 });
  }

  await prisma.eveningReport.delete({ where: { id: report.id } });

  return NextResponse.json({ message: "Đã xoá báo cáo chiều" });
}
