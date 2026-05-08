import { TptcAssignmentStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
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
      status: true,
      assignedByUserId: true,
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "Không tìm thấy việc TPTC" }, { status: 404 });
  }

  if (assignment.assignedByUserId !== actor.id && actor.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ người giao việc mới được hủy" }, { status: 403 });
  }

  if (assignment.status === TptcAssignmentStatus.approved) {
    return NextResponse.json({ message: "Việc đã duyệt, không thể hủy" }, { status: 400 });
  }

  if (assignment.status === TptcAssignmentStatus.cancelled) {
    return NextResponse.json({ message: "Việc đã được hủy trước đó" }, { status: 400 });
  }

  const updated = await prisma.tptcAssignment.update({
    where: { id: params.id },
    data: {
      status: TptcAssignmentStatus.cancelled,
    },
  });

  return NextResponse.json({
    message: "Đã hủy việc TPTC",
    assignment: updated,
  });
}
