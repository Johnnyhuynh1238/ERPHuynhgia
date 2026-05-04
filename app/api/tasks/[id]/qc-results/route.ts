import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canUpdateQc, getTaskWithAccess } from "@/lib/task-permissions";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
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

  const taskDetail = await prisma.task.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      templateId: true,
      status: true,
      origin: true,
      category: true,
      qcCompletedAt: true,
    },
  });

  if (!taskDetail) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }

  if (!taskDetail.templateId) {
    return NextResponse.json({
      taskId: taskDetail.id,
      origin: taskDetail.origin,
      category: taskDetail.category,
      status: taskDetail.status,
      qcCompletedAt: taskDetail.qcCompletedAt,
      canUpdate: canUpdateQc(task, { id: user.id, role: user.role }),
      items: [],
      summary: {
        total: 0,
        passed: 0,
        remaining: 0,
        completed: false,
      },
    });
  }

  const [templateItems, results] = await Promise.all([
    prisma.qcChecklistItem.findMany({
      where: {
        template: {
          taskTemplateId: taskDetail.templateId,
        },
      },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        displayOrder: true,
        title: true,
        description: true,
        requirePhoto: true,
      },
    }),
    prisma.taskQcResult.findMany({
      where: { taskId: params.id },
      orderBy: { updatedAt: "desc" },
      include: {
        checker: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    }),
  ]);

  const resultMap = new Map(results.map((result) => [result.itemId, result]));

  const rows = templateItems.map((item) => {
    const result = resultMap.get(item.id);
    return {
      item,
      result: result
        ? {
            id: result.id,
            isPassed: result.isPassed,
            photoUrl: result.photoUrl,
            note: result.note,
            checkedAt: result.checkedAt,
            updatedAt: result.updatedAt,
            checkedBy: result.checker,
          }
        : null,
    };
  });

  const total = rows.length;
  const passed = rows.filter((row) => row.result?.isPassed).length;

  return NextResponse.json({
    taskId: taskDetail.id,
    origin: taskDetail.origin,
    category: taskDetail.category,
    status: taskDetail.status,
    qcCompletedAt: taskDetail.qcCompletedAt,
    canUpdate: canUpdateQc(task, { id: user.id, role: user.role }),
    items: rows,
    summary: {
      total,
      passed,
      remaining: Math.max(total - passed, 0),
      completed: total > 0 && passed === total,
    },
  });
}
