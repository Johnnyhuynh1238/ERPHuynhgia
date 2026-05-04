import { NextResponse } from "next/server";
import { TaskActivityType, TaskLogType, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { syncPhaseStatusByTaskId } from "@/lib/project-phase";
import { canChangeStatus, getTaskWithAccess } from "@/lib/task-permissions";

const approveSchema = z.object({
  note: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (!canChangeStatus(task, { id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền duyệt nội bộ" }, { status: 403 });
  }

  const taskDetail = await prisma.task.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      internalApprovedBy: true,
      internalApprovedAt: true,
    },
  });

  if (!taskDetail) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }

  if (taskDetail.status === TaskStatus.internal_approved || taskDetail.status === TaskStatus.completed) {
    return NextResponse.json({ message: "Task đã được duyệt nội bộ" }, { status: 400 });
  }

  if (taskDetail.status !== TaskStatus.done) {
    return NextResponse.json({ message: "Chỉ được duyệt nội bộ khi task đã Done" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const note = String(parsed.data.note || "").trim();
  const now = new Date();

  const updatedTask = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: params.id },
      data: {
        status: TaskStatus.internal_approved,
        internalApprovedBy: user.id,
        internalApprovedAt: now,
        internalApproverNote: note || null,
      },
    });

    await tx.taskActivityLog.create({
      data: {
        taskId: params.id,
        userId: user.id,
        type: TaskActivityType.internal_approved,
        fromValue: taskDetail.status,
        toValue: TaskStatus.internal_approved,
        metadata: {
          note: note || null,
        },
        description: "Duyệt nội bộ bởi TPTC/Admin",
      },
    });

    await tx.taskLog.create({
      data: {
        taskId: params.id,
        userId: user.id,
        logType: TaskLogType.status_change,
        oldValue: taskDetail.status,
        newValue: TaskStatus.internal_approved,
        content: `INTERNAL_APPROVE: ${taskDetail.status} -> ${TaskStatus.internal_approved}`,
      },
    });

    await syncPhaseStatusByTaskId(tx, params.id, now);

    return updated;
  });

  return NextResponse.json({
    message: "Đã duyệt nội bộ task",
    task: updatedTask,
  });
}
