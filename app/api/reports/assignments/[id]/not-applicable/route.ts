import { DailyAssignmentType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEngineerForTodayAssignment } from "../../_helpers";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireEngineerForTodayAssignment(params.id);
  if ("error" in auth) return auth.error;

  if (auth.assignment.type === DailyAssignmentType.progress_update) {
    return NextResponse.json({ message: "Nhiệm vụ cập nhật tiến độ không thể đánh dấu không áp dụng" }, { status: 400 });
  }

  await prisma.taskDailyAssignment.update({
    where: { id: auth.assignment.id },
    data: {
      status: "not_applicable",
      photoUrl: null,
      note: null,
      doneAt: new Date(),
    },
  });

  return NextResponse.json({ message: "Đã đánh dấu không áp dụng" });
}
