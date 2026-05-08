import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { generateAssignmentsAfterCheckin, getReportDateVn, upsertPendingTptcAssignmentsForDay } from "@/lib/reports-v3";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.id || user.role !== "engineer") {
      return NextResponse.json({ message: "Chỉ KS được check-in" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const taskIds: string[] = Array.isArray(body?.taskIds) ? body.taskIds.filter((id: unknown) => typeof id === "string") : [];
    const tptcAssignmentIds: string[] = Array.isArray(body?.tptcAssignmentIds)
      ? body.tptcAssignmentIds.filter((id: unknown) => typeof id === "string")
      : [];

    if (!taskIds.length && !tptcAssignmentIds.length) {
      return NextResponse.json({ message: "Bạn chưa chọn công việc nào" }, { status: 400 });
    }

    const reportDate = getReportDateVn();

    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: {
          id: { in: taskIds },
          assignedEngineerId: user.id,
          status: "not_started",
        },
        data: {
          status: "in_progress",
          actualStartDate: reportDate,
        },
      });

      const existing = await tx.morningCheckin.findFirst({
        where: {
          userId: user.id,
          reportDate,
        },
        select: { id: true },
      });

      if (existing) {
        await tx.morningCheckinTask.deleteMany({ where: { checkinId: existing.id } });
        await tx.morningCheckin.update({
          where: { id: existing.id },
          data: {
            submittedAt: new Date(),
            tasks: {
              create: taskIds.map((taskId) => ({
                taskId,
                taskGroup: "manual_checkin",
              })),
            },
          },
        });
      } else {
        const firstTask = await tx.task.findFirst({
          where: { id: { in: taskIds } },
          select: { projectId: true },
        });

        if (!firstTask) {
          throw new Error("Không tìm thấy task hợp lệ để check-in");
        }

        await tx.morningCheckin.create({
          data: {
            userId: user.id,
            projectId: firstTask.projectId,
            reportDate,
            submittedAt: new Date(),
            tasks: {
              create: taskIds.map((taskId) => ({
                taskId,
                taskGroup: "manual_checkin",
              })),
            },
          },
        });
      }
    });

    const generated = await generateAssignmentsAfterCheckin({
      ksUserId: user.id,
      reportDate,
      taskIds,
    });

    const tptcGenerated = await upsertPendingTptcAssignmentsForDay({
      ksUserId: user.id,
      reportDate,
      selectedIds: tptcAssignmentIds,
    });

    return NextResponse.json({
      ok: true,
      checkedInTasks: taskIds.length,
      createdAssignments: generated.created,
      createdTptcAssignments: tptcGenerated.created,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Check-in thất bại" },
      { status: 500 },
    );
  }
}
