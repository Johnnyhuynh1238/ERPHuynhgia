import { TptcAssignmentStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { fireAndForget, notifyTptcRemind } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

function isTptcRole(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser();
  if (!actor?.id || !actor.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!isTptcRole(actor.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const assignment = await prisma.tptcAssignment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      projectId: true,
      assignedToUserId: true,
      status: true,
      title: true,
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "Không tìm thấy việc TPTC" }, { status: 404 });
  }

  if (
    assignment.status === TptcAssignmentStatus.done ||
    assignment.status === TptcAssignmentStatus.approved ||
    assignment.status === TptcAssignmentStatus.cancelled
  ) {
    return NextResponse.json({ message: "Việc đã xong hoặc đã huỷ, không cần nhắc" }, { status: 400 });
  }

  fireAndForget(
    notifyTptcRemind({
      projectId: assignment.projectId,
      assignmentId: assignment.id,
      assigneeUserId: assignment.assignedToUserId,
      actorUserId: actor.id,
      actorName: actor.name ?? "TPTC",
      title: assignment.title,
    }),
  );

  return NextResponse.json({ message: "Đã gửi nhắc tới KS" });
}
