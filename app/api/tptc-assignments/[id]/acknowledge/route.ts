import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { fireAndForget, notifyTptcAssignmentAcknowledged } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser();
  if (!actor?.id) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const assignment = await prisma.tptcAssignment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      projectId: true,
      assignedToUserId: true,
      assignedByUserId: true,
      title: true,
      acknowledgedAt: true,
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "Không tìm thấy việc TPTC" }, { status: 404 });
  }

  if (assignment.assignedToUserId !== actor.id) {
    return NextResponse.json({ message: "Chỉ KS được giao mới xác nhận được" }, { status: 403 });
  }

  if (assignment.acknowledgedAt) {
    return NextResponse.json({
      message: "Đã xác nhận trước đó",
      acknowledgedAt: assignment.acknowledgedAt,
    });
  }

  const now = new Date();
  const updated = await prisma.tptcAssignment.update({
    where: { id: assignment.id },
    data: { acknowledgedAt: now },
    select: { acknowledgedAt: true },
  });

  fireAndForget(
    notifyTptcAssignmentAcknowledged({
      projectId: assignment.projectId,
      assignmentId: assignment.id,
      assignerUserId: assignment.assignedByUserId,
      actorUserId: actor.id,
      actorName: actor.name ?? "KS",
      title: assignment.title,
    }),
  );

  return NextResponse.json({
    message: "Đã xác nhận nhận việc",
    acknowledgedAt: updated.acknowledgedAt,
  });
}
