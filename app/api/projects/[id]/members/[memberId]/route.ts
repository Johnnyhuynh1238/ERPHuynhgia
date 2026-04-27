import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; memberId: string } },
) {
  try {
    await requireRole(["admin"]);
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
      user: {
        select: {
          email: true,
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

  await prisma.projectMember.delete({ where: { id: member.id } });

  return NextResponse.json({
    message: "Đã xóa thành viên",
    assignedTaskCount,
    email: member.user.email,
  });
}
