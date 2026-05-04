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
      origin: true,
      category: true,
      qcChecklist: true,
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
      qcTemplate: null,
      items: [],
    });
  }

  const template = await prisma.qcChecklistTemplate.findUnique({
    where: { taskTemplateId: taskDetail.templateId },
    include: {
      qcItems: {
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          displayOrder: true,
          title: true,
          description: true,
          requirePhoto: true,
        },
      },
    },
  });

  return NextResponse.json({
    taskId: taskDetail.id,
    origin: taskDetail.origin,
    category: taskDetail.category,
    qcChecklist: taskDetail.qcChecklist,
    qcTemplate: template
      ? {
          id: template.id,
          preparationSteps: template.preparationSteps,
          executionSteps: template.executionSteps,
          commonMistakes: template.commonMistakes,
          beforeQcSteps: template.beforeQcSteps,
        }
      : null,
    items: template?.qcItems || [],
  });
}
