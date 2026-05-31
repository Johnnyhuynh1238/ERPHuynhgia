import { DailyAssignmentType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  generateAssignmentsAfterCheckin,
  getReportDateVn,
  getSubmissionDeadline,
  sortFlatAssignments,
  upsertPendingTptcAssignmentsForDay,
} from "@/lib/reports-v3";
import { isDefaultRestDay } from "@/lib/reporting";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== "engineer") {
    return NextResponse.json({ message: "Chỉ KS được xem trang này" }, { status: 403 });
  }

  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode");
  const mode: "flat" | "task" | "project" = modeParam === "task" || modeParam === "project" ? modeParam : "flat";

  const reportDate = getReportDateVn();
  const now = new Date();

  await upsertPendingTptcAssignmentsForDay({
    ksUserId: user.id,
    reportDate,
  });

  const readRows = () =>
    prisma.taskDailyAssignment.findMany({
      where: {
        ksUserId: user.id,
        reportDate,
      },
      include: {
        task: {
          select: {
            id: true,
            code: true,
            name: true,
            progressPercent: true,
            project: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        tptcAssignment: {
          select: {
            id: true,
            dueAt: true,
            priority: true,
            status: true,
            project: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
    });

  let rows = await readRows();

  if (!rows.length) {
    const morningCheckin = await prisma.morningCheckin.findFirst({
      where: {
        userId: user.id,
        reportDate,
      },
      select: {
        tasks: {
          select: {
            taskId: true,
          },
        },
      },
    });

    const checkinTaskIds = Array.from(new Set((morningCheckin?.tasks || []).map((item) => item.taskId).filter(Boolean)));

    if (checkinTaskIds.length) {
      await generateAssignmentsAfterCheckin({
        ksUserId: user.id,
        reportDate,
        taskIds: checkinTaskIds,
      });
      rows = await readRows();
    }
  }

  const assignments = rows.map((row) => {
    const base = {
      id: row.id,
      type: row.type,
      title: row.title,
      status: row.status,
      priority: row.priority,
      requirePhoto: row.requirePhoto,
      guideContent: row.guideContent,
      photoUrl: row.photoUrl,
      note: row.note,
      doneAt: row.doneAt,
      dueAt: row.tptcAssignment?.dueAt || null,
      projectId: row.task?.project.id || row.tptcAssignment?.project.id || null,
      projectName:
        row.task?.project ? `${row.task.project.code} · ${row.task.project.name}` : row.tptcAssignment?.project ? `${row.tptcAssignment.project.code} · ${row.tptcAssignment.project.name}` : null,
    };

    if (row.type === DailyAssignmentType.template_item) {
      return {
        ...base,
        taskId: row.task?.id || null,
        taskCode: row.task?.code || null,
        taskName: row.task?.name || null,
      };
    }

    if (row.type === DailyAssignmentType.progress_update) {
      return {
        ...base,
        taskId: row.task?.id || null,
        taskCode: row.task?.code || null,
        taskName: row.task?.name || null,
        currentProgress: row.task?.progressPercent ?? 0,
      };
    }

    if (row.type === DailyAssignmentType.qc_checklist) {
      return {
        ...base,
        taskId: row.task?.id || null,
        taskCode: row.task?.code || null,
        taskName: row.task?.name || null,
      };
    }

    return {
      ...base,
      tptcAssignmentId: row.tptcAssignment?.id || null,
      tptcStatus: row.tptcAssignment?.status || null,
    };
  });

  const sorted = sortFlatAssignments(assignments as any[]) as any[];

  const stats = {
    total: sorted.length,
    done: sorted.filter((item) => item.status === "done").length,
    notApplicable: sorted.filter((item) => item.status === "not_applicable").length,
    pending: sorted.filter((item) => item.status === "pending").length,
  };

  const submission = await prisma.dailyReportSubmission.findUnique({
    where: {
      ksUserId_reportDate: {
        ksUserId: user.id,
        reportDate,
      },
    },
    select: {
      id: true,
      submittedAt: true,
      isLate: true,
    },
  });

  const taskGroups = Object.values(
    sorted
      .filter((item) => item.taskId)
      .reduce<Record<string, { taskId: string; taskCode: string | null; taskName: string | null; projectName: string | null; assignments: any[] }>>((acc, item) => {
        const key = item.taskId as string;
        if (!acc[key]) {
          acc[key] = {
            taskId: key,
            taskCode: item.taskCode || null,
            taskName: item.taskName || null,
            projectName: item.projectName || null,
            assignments: [],
          };
        }
        acc[key].assignments.push(item);
        return acc;
      }, {}),
  );

  const projectGroups = Object.values(
    sorted.reduce<Record<string, { projectId: string; projectName: string | null; assignments: any[] }>>((acc, item) => {
      const key = item.projectId || "unknown";
      if (!acc[key]) {
        acc[key] = {
          projectId: item.projectId || "unknown",
          projectName: item.projectName || "Không rõ dự án",
          assignments: [],
        };
      }
      acc[key].assignments.push(item);
      return acc;
    }, {}),
  );

  const defaultRest = isDefaultRestDay(reportDate)
    ? {
        isSunday: true,
        message:
          "Chủ Nhật — công trường nghỉ mặc định. Bạn không bắt buộc check-in/báo cáo và KPI không tính ngày này. Nếu có làm việc phát sinh, hãy check-in và báo cáo như bình thường.",
      }
    : null;

  return NextResponse.json({
    date: reportDate,
    submissionDeadline: getSubmissionDeadline(reportDate),
    currentTime: now,
    submitted: Boolean(submission),
    submission,
    mode,
    stats,
    defaultRest,
    assignments: mode === "flat" ? sorted : assignments,
    taskGroups,
    projectGroups,
  });
}
