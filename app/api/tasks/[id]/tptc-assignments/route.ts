import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getTaskWithAccess } from "@/lib/task-permissions";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const rows = await prisma.tptcAssignment.findMany({
    where: { taskId: params.id },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      dueAt: true,
      acknowledgedAt: true,
      completedAt: true,
      approvedAt: true,
      ksNote: true,
      reviewNote: true,
      createdAt: true,
      assignee: { select: { id: true, fullName: true } },
      assigner: { select: { id: true, fullName: true } },
    },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ rows });
}
