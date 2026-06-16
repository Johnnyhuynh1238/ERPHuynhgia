import { TptcAssignmentStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { fireAndForget, notifyTptcAssignmentReviewed } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  reviewNote: z.string().trim().min(1, "Vui lòng nhập lý do reject"),
});

function isTptcRole(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
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
      status: true,
      projectId: true,
      assignedToUserId: true,
      title: true,
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "Không tìm thấy việc TPTC" }, { status: 404 });
  }

  if (assignment.status !== TptcAssignmentStatus.done) {
    return NextResponse.json({ message: "Chỉ reject được việc đã hoàn thành" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const updated = await prisma.tptcAssignment.update({
    where: { id: params.id },
    data: {
      status: TptcAssignmentStatus.rejected,
      approvedAt: null,
      reviewNote: parsed.data.reviewNote,
      completedAt: null,
    },
  });

  fireAndForget(
    notifyTptcAssignmentReviewed({
      projectId: assignment.projectId,
      assignmentId: assignment.id,
      assigneeUserId: assignment.assignedToUserId,
      actorUserId: actor.id,
      actorName: actor.name ?? "TPTC",
      title: assignment.title,
      decision: "rejected",
      reviewNote: parsed.data.reviewNote,
    }),
  );

  return NextResponse.json({
    message: "Đã reject việc TPTC",
    assignment: updated,
  });
}
