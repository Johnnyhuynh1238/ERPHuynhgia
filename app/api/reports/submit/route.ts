import { TaskActivityType, TaskLogType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getReportDateVn, isAfterSubmissionDeadline, isPastEndOfDayVn } from "@/lib/reports-v3";

export async function POST() {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== "engineer") {
    return NextResponse.json({ message: "Chỉ KS được gửi báo cáo cuối ngày" }, { status: 403 });
  }

  const reportDate = getReportDateVn();
  const now = new Date();

  if (isPastEndOfDayVn(now, reportDate)) {
    return NextResponse.json({ message: "Đã qua 23:59, không thể gửi báo cáo cho hôm nay" }, { status: 400 });
  }

  const assignments = await prisma.taskDailyAssignment.findMany({
    where: {
      ksUserId: user.id,
      reportDate,
    },
    select: {
      id: true,
      title: true,
      status: true,
      taskId: true,
      type: true,
      tptcAssignmentId: true,
      tptcAssignment: {
        select: {
          dailyStatuses: {
            where: { reportDate },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!assignments.length) {
    return NextResponse.json({ message: "Bạn chưa có nhiệm vụ nào để gửi báo cáo" }, { status: 400 });
  }

  const pending = assignments.filter((item) => {
    if (item.status !== "pending") return false;
    if (item.type === "tptc_assignment" && item.tptcAssignment?.dailyStatuses?.length) {
      return false;
    }
    return true;
  });
  if (pending.length > 0) {
    return NextResponse.json(
      {
        message: `Còn ${pending.length} nhiệm vụ chưa tick`,
        pendingItems: pending.map((item) => ({ id: item.id, title: item.title })),
      },
      { status: 400 },
    );
  }

  const existing = await prisma.dailyReportSubmission.findUnique({
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

  if (existing) {
    return NextResponse.json(
      {
        message: "Bạn đã gửi báo cáo hôm nay rồi",
        submission: existing,
      },
      { status: 400 },
    );
  }

  const doneItems = assignments.filter((item) => item.status === "done").length;
  const notApplicableItems = assignments.filter((item) => item.status === "not_applicable").length;
  const isLate = isAfterSubmissionDeadline(now, reportDate);
  const reportDateLabel = reportDate.toISOString().slice(0, 10);

  const submission = await prisma.$transaction(async (tx) => {
    const created = await tx.dailyReportSubmission.create({
      data: {
        ksUserId: user.id,
        reportDate,
        submittedAt: now,
        isLate,
        totalItems: assignments.length,
        doneItems,
        notApplicableItems,
      },
      select: {
        id: true,
        submittedAt: true,
        isLate: true,
        totalItems: true,
        doneItems: true,
        notApplicableItems: true,
      },
    });

    const taskIds = Array.from(new Set(assignments.map((item) => item.taskId).filter(Boolean) as string[]));

    for (const taskId of taskIds) {
      const taskAssignments = assignments.filter((item) => item.taskId === taskId);
      await tx.taskActivityLog.create({
        data: {
          taskId,
          userId: user.id,
          type: TaskActivityType.task_updated,
          metadata: {
            reportDate: reportDateLabel,
            totalItems: taskAssignments.length,
            doneItems: taskAssignments.filter((item) => item.status === "done").length,
            notApplicableItems: taskAssignments.filter((item) => item.status === "not_applicable").length,
          },
          description: `Gửi báo cáo ngày ${reportDateLabel}: ${taskAssignments.length} nhiệm vụ`,
        },
      });

      await tx.taskLog.create({
        data: {
          taskId,
          userId: user.id,
          logType: TaskLogType.report_edit,
          content: `DAILY_REPORT_SUBMITTED: ${reportDateLabel}`,
        },
      });
    }

    return created;
  });

  return NextResponse.json({
    message: "Đã gửi báo cáo cuối ngày",
    submission,
  });
}
