import { NextResponse } from "next/server";
import { TaskLogType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTaskWithAccess } from "@/lib/task-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.construction_manager) {
    return NextResponse.json({ message: "Không có quyền khôi phục task" }, { status: 403 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (task.isActive) {
    return NextResponse.json({ message: "Task đang ở trạng thái hoạt động" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    const maxOrder = await tx.task.aggregate({
      where: {
        projectId: task.projectId,
        isActive: true,
      },
      _max: {
        displayOrder: true,
      },
    });

    const nextDisplayOrder = (maxOrder._max.displayOrder ?? 0) + 100;

    await tx.task.update({
      where: { id: task.id },
      data: {
        isActive: true,
        displayOrder: nextDisplayOrder,
      },
    });

    await tx.taskLog.create({
      data: {
        taskId: task.id,
        userId: user.id,
        logType: TaskLogType.note,
        content: "Đã khôi phục task",
      },
    });

    await logProjectActivity(tx, {
      projectId: task.projectId,
      actorId: user.id,
      entity: "task",
      entityId: task.id,
      action: "restore",
      summary: `Khôi phục task ${task.code} "${task.name}"`,
      metadata: { displayOrder: nextDisplayOrder },
    });
  });

  return NextResponse.json({ message: "Đã khôi phục task" });
}
