import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canManageItem, getTaskWithAccess } from "@/lib/task-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";

const createSchema = z.object({
  name: z.string().trim().min(1, "Tên vật tư là bắt buộc"),
  orderIndex: z.number().int().min(0).optional(),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const items = await prisma.$transaction(async (tx) => {
    const existing = await tx.taskMaterialItem.findMany({ where: { taskId: params.id }, orderBy: { orderIndex: "asc" } });
    if (existing.length > 0) return existing;

    const names = task.materialsNeeded.split("\n").map((line) => line.trim()).filter(Boolean);
    if (names.length === 0) return existing;

    const recheck = await tx.taskMaterialItem.findMany({ where: { taskId: params.id }, orderBy: { orderIndex: "asc" } });
    if (recheck.length > 0) return recheck;

    await tx.taskMaterialItem.createMany({
      data: names.map((name, orderIndex) => ({ taskId: params.id, name, orderIndex })),
    });
    return tx.taskMaterialItem.findMany({ where: { taskId: params.id }, orderBy: { orderIndex: "asc" } });
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  if (!canManageItem(task, { id: user.id, role: user.role })) return NextResponse.json({ message: "Không có quyền thêm vật tư" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });

  const orderIndex = parsed.data.orderIndex ?? ((await prisma.taskMaterialItem.aggregate({ where: { taskId: params.id }, _max: { orderIndex: true } }))._max.orderIndex ?? -1) + 1;
  const item = await prisma.taskMaterialItem.create({ data: { taskId: params.id, name: parsed.data.name, orderIndex } });

  await logProjectActivity(prisma, {
    projectId: task.projectId,
    actorId: user.id,
    entity: "task_material",
    entityId: item.id,
    action: "create",
    summary: `Thêm vật tư "${parsed.data.name}" cho task ${task.code} "${task.name}"`,
    metadata: { taskId: params.id, name: parsed.data.name, orderIndex },
  });

  return NextResponse.json({ item, message: "Đã thêm vật tư" }, { status: 201 });
}
