import { AssignmentPriority, TptcAssignmentStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const updateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    priority: z.nativeEnum(AssignmentPriority).optional(),
    dueAt: z.coerce.date().optional(),
    assignedToUserId: z.string().uuid().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Không có dữ liệu cần cập nhật",
  });

function isTptcRole(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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

  if (assignment.assignedByUserId !== actor.id) {
    return NextResponse.json({ message: "Chỉ người giao việc mới được chỉnh sửa" }, { status: 403 });
  }

  if (assignment.status === TptcAssignmentStatus.approved || assignment.status === TptcAssignmentStatus.cancelled) {
    return NextResponse.json({ message: "Việc đã chốt trạng thái, không thể chỉnh sửa" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (parsed.data.assignedToUserId) {
    const assignee = await prisma.user.findUnique({
      where: { id: parsed.data.assignedToUserId },
      select: { id: true, role: true, isActive: true },
    });

    if (!assignee || assignee.role !== UserRole.engineer || !assignee.isActive) {
      return NextResponse.json({ message: "KS nhận việc không hợp lệ" }, { status: 400 });
    }
  }

  const updated = await prisma.tptcAssignment.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
      ...(parsed.data.dueAt !== undefined ? { dueAt: parsed.data.dueAt } : {}),
      ...(parsed.data.assignedToUserId !== undefined ? { assignedToUserId: parsed.data.assignedToUserId } : {}),
    },
  });

  return NextResponse.json({
    message: "Đã cập nhật việc TPTC",
    assignment: updated,
  });
}
