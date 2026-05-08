import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getReportDateVn } from "@/lib/reports-v3";

export async function requireEngineerForTodayAssignment(assignmentId: string) {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== "engineer") {
    return {
      error: NextResponse.json({ message: "Chỉ KS được thao tác nhiệm vụ" }, { status: 403 }),
    };
  }

  const reportDate = getReportDateVn();
  const assignment = await prisma.taskDailyAssignment.findFirst({
    where: {
      id: assignmentId,
      ksUserId: user.id,
      reportDate,
    },
    include: {
      tptcAssignment: true,
      task: {
        select: {
          id: true,
          progressPercent: true,
          status: true,
        },
      },
    },
  });

  if (!assignment) {
    return {
      error: NextResponse.json({ message: "Không tìm thấy nhiệm vụ hôm nay" }, { status: 404 }),
    };
  }

  return {
    user,
    reportDate,
    assignment,
  };
}
