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
import { buildWorkerAttendanceAssignments } from "@/lib/worker-attendance-assignments";
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
        type: {
          notIn: [
            DailyAssignmentType.worker_attendance_morning,
            DailyAssignmentType.worker_attendance_afternoon,
          ],
        },
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
            description: true,
            dueAt: true,
            priority: true,
            status: true,
            reviewNote: true,
            acknowledgedAt: true,
            assigner: {
              select: { fullName: true },
            },
            project: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            dailyStatuses: {
              where: { reportDate },
              select: {
                status: true,
                note: true,
                updatedAt: true,
              },
              take: 1,
            },
          },
        },
      },
    });

  let rows = await readRows();

  const morningCheckin = await prisma.morningCheckin.findFirst({
    where: {
      userId: user.id,
      reportDate,
    },
    select: {
      id: true,
      tasks: {
        select: {
          taskId: true,
        },
      },
    },
  });
  const hasCheckedIn = Boolean(morningCheckin);

  if (!rows.length && morningCheckin) {
    const checkinTaskIds = Array.from(new Set(morningCheckin.tasks.map((item) => item.taskId).filter(Boolean)));

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

    const dailyStatusRow = row.tptcAssignment?.dailyStatuses?.[0] || null;
    return {
      ...base,
      tptcAssignmentId: row.tptcAssignment?.id || null,
      tptcStatus: row.tptcAssignment?.status || null,
      tptcDescription: row.tptcAssignment?.description || null,
      tptcAssignerName: row.tptcAssignment?.assigner?.fullName || null,
      tptcReviewNote: row.tptcAssignment?.reviewNote || null,
      tptcAcknowledgedAt: row.tptcAssignment?.acknowledgedAt ? row.tptcAssignment.acknowledgedAt.toISOString() : null,
      tptcDailyStatus: dailyStatusRow?.status || null,
      tptcDailyNote: dailyStatusRow?.note || null,
    };
  });

  const workerAttendanceItems = hasCheckedIn
    ? await buildWorkerAttendanceAssignments({
        ksUserId: user.id,
        reportDate,
        now,
      })
    : [];

  const sorted = sortFlatAssignments([...assignments, ...workerAttendanceItems] as any[]) as any[];

  const stats = {
    total: sorted.length,
    done: sorted.filter((item) => item.status === "done").length,
    notApplicable: sorted.filter((item) => item.status === "not_applicable").length,
    pending: sorted.filter((item) => {
      if (item.status !== "pending") return false;
      if (item.type === "tptc_assignment" && item.tptcDailyStatus) return false;
      return true;
    }).length,
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
