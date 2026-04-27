import { NextResponse } from "next/server";
import { TaskLogType, TaskStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { parseYmdToUtcDate, toUtcStartOfDay } from "@/lib/date";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { createTaskLog } from "@/lib/reporting";

const bodySchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1, "Phải chọn ít nhất 1 task"),
  actualEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.construction_manager) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const doneDate = toUtcStartOfDay(parsed.data.actualEndDate ? parseYmdToUtcDate(parsed.data.actualEndDate) : new Date());

  const tasks = await prisma.task.findMany({
    where: {
      id: { in: parsed.data.taskIds },
      projectId: params.id,
      isActive: true,
    },
    select: {
      id: true,
      status: true,
      actualStartDate: true,
    },
  });

  if (tasks.length !== parsed.data.taskIds.length) {
    return NextResponse.json({ message: "Danh sách task không hợp lệ" }, { status: 400 });
  }

  const updatable = tasks.filter((task) => task.status !== TaskStatus.inspected && task.status !== TaskStatus.na);
  if (updatable.length === 0) {
    return NextResponse.json({ message: "Không có task hợp lệ để mark inspected" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    for (const task of updatable) {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.inspected,
          actualStartDate: task.actualStartDate ?? doneDate,
          actualEndDate: doneDate,
        },
      });

      await tx.taskLog.create({
        data: {
          taskId: task.id,
          userId: user.id,
          logType: TaskLogType.status_change,
          oldValue: task.status,
          newValue: TaskStatus.inspected,
          content: `Đổi trạng thái từ ${task.status} -> ${TaskStatus.inspected} (bulk)`,
        },
      });

      await createTaskLog(task.id, user.id, "Đã mark inspected (bulk)");
    }
  });

  return NextResponse.json({ message: `Đã mark inspected ${updatable.length} task`, updatedCount: updatable.length });
}
