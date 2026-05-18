import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";

const reorderItemSchema = z.object({
  taskId: z.string().uuid("Task id không hợp lệ"),
  displayOrder: z.number().int("displayOrder phải là số nguyên"),
});

const reorderSchema = z.array(reorderItemSchema).min(1, "Danh sách task rỗng");

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
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const reorderItems = parsed.data;

  const activeTasks = await prisma.task.findMany({
    where: { projectId: params.id, isActive: true },
    select: { id: true },
  });

  if (reorderItems.length !== activeTasks.length) {
    return NextResponse.json({ message: "Danh sách task không khớp số lượng task đang active" }, { status: 400 });
  }

  const activeSet = new Set(activeTasks.map((t) => t.id));
  const seen = new Set<string>();
  for (const item of reorderItems) {
    if (!activeSet.has(item.taskId)) {
      return NextResponse.json({ message: "Danh sách task chứa id không hợp lệ" }, { status: 400 });
    }
    if (seen.has(item.taskId)) {
      return NextResponse.json({ message: "Danh sách task bị trùng id" }, { status: 400 });
    }
    seen.add(item.taskId);
  }

  await prisma.$transaction(async (tx) => {
    for (const item of reorderItems) {
      await tx.task.update({
        where: { id: item.taskId },
        data: { displayOrder: item.displayOrder },
      });
    }

    await logProjectActivity(tx, {
      projectId: params.id,
      actorId: user.id,
      entity: "task",
      entityId: params.id,
      action: "reorder",
      summary: `Sắp xếp lại thứ tự ${reorderItems.length} task`,
      metadata: { count: reorderItems.length },
    });
  });

  return NextResponse.json({ message: "Đã cập nhật thứ tự task" });
}
