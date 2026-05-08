import { DailyAssignmentType, TptcAssignmentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEngineerForTodayAssignment } from "../../_helpers";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireEngineerForTodayAssignment(params.id);
  if ("error" in auth) return auth.error;

  await prisma.$transaction(async (tx) => {
    await tx.taskDailyAssignment.update({
      where: { id: auth.assignment.id },
      data: {
        status: "pending",
        photoUrl: null,
        note: null,
        doneAt: null,
      },
    });

    if (auth.assignment.type === DailyAssignmentType.tptc_assignment && auth.assignment.tptcAssignmentId) {
      await tx.tptcAssignment.update({
        where: { id: auth.assignment.tptcAssignmentId },
        data: {
          status: TptcAssignmentStatus.pending,
          completedAt: null,
          ksNote: null,
        },
      });
    }
  });

  return NextResponse.json({ message: "Đã bỏ đánh dấu hoàn thành" });
}
