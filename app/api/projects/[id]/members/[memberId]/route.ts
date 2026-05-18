import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { logProjectActivity } from "@/lib/project-activity-log";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; memberId: string } },
) {
  let actor;
  try {
    await requireRole(["admin"]);
    actor = await getCurrentUser();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const member = await prisma.projectMember.findFirst({
    where: {
      id: params.memberId,
      projectId: params.id,
    },
    select: {
      id: true,
      userId: true,
      projectId: true,
      roleInProject: true,
      user: {
        select: {
          email: true,
          fullName: true,
        },
      },
    },
  });

  if (!member) {
    return NextResponse.json({ message: "Không tìm thấy member" }, { status: 404 });
  }

  const assignedTaskCount = await prisma.task.count({
    where: {
      projectId: params.id,
      isActive: true,
      OR: [{ assignedEngineerId: member.userId }, { assignedForemanId: member.userId }],
    },
  });

  const confirm = new URL(request.url).searchParams.get("confirm") === "1";

  if (assignedTaskCount > 0 && !confirm) {
    return NextResponse.json(
      {
        message: `User này đang phụ trách ${assignedTaskCount} task, bạn muốn tiếp tục?`,
        assignedTaskCount,
        requiresConfirm: true,
      },
      { status: 409 },
    );
  }

  const removedAssignments = await prisma.$transaction(async (tx) => {
    const existingAssignments = await tx.projectMemberAssignment.findMany({
      where: {
        projectId: member.projectId,
        userId: member.userId,
      },
      select: { role: true, isPrimary: true },
    });

    await tx.projectMember.delete({ where: { id: member.id } });
    await tx.projectMemberAssignment.deleteMany({
      where: {
        projectId: member.projectId,
        userId: member.userId,
      },
    });

    if (actor?.id) {
      await logProjectActivity(tx, {
        projectId: params.id,
        actorId: actor.id,
        entity: "project_member",
        entityId: member.id,
        action: "delete",
        summary: `Xóa thành viên ${member.user.fullName} (${member.roleInProject})${existingAssignments.length ? ` + ${existingAssignments.length} phân công` : ""}${assignedTaskCount ? ` (đang phụ trách ${assignedTaskCount} task)` : ""}`,
        snapshot: {
          userId: member.userId,
          email: member.user.email,
          fullName: member.user.fullName,
          roleInProject: member.roleInProject,
          removedAssignments: existingAssignments,
          assignedTaskCount,
        },
      });
    }

    return existingAssignments;
  });

  return NextResponse.json({
    message: "Đã xóa thành viên",
    assignedTaskCount,
    email: member.user.email,
  });
}
