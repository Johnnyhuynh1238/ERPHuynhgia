import { NextResponse } from "next/server";
import { z } from "zod";
import { BudgetStage } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditBudget } from "@/lib/project-budget";
import { logProjectActivity } from "@/lib/project-activity-log";

const patchSchema = z.object({
  stage: z.nativeEnum(BudgetStage).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  floor: z.string().trim().max(8).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  note: z.string().trim().max(500).optional().nullable(),
});

async function ensureAccess(projectId: string, componentId: string, userId: string, role: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...buildProjectAccessWhere({ id: userId, role }) },
    select: { id: true },
  });
  if (!project) return null;
  const component = await prisma.projectComponent.findFirst({
    where: { id: componentId, projectId },
  });
  return component;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; componentId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được sửa cấu kiện" }, { status: 403 });
  }

  const component = await ensureAccess(params.id, params.componentId, user.id, user.role);
  if (!component) return NextResponse.json({ message: "Không tìm thấy cấu kiện" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const body = parsed.data;

  const updated = await prisma.projectComponent.update({
    where: { id: component.id },
    data: {
      ...(body.stage !== undefined ? { stage: body.stage } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.floor !== undefined ? { floor: body.floor?.trim() ? body.floor.trim() : null } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.note !== undefined ? { note: body.note?.trim() ? body.note.trim() : null } : {}),
    },
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "project_component",
    entityId: component.id,
    action: "update",
    summary: `Sửa cấu kiện ${updated.stage} — ${updated.name}${updated.floor ? ` (${updated.floor})` : ""}`,
    metadata: { stage: updated.stage, name: updated.name, floor: updated.floor },
  });

  return NextResponse.json({
    component: {
      id: updated.id,
      stage: updated.stage,
      name: updated.name,
      floor: updated.floor,
      sortOrder: updated.sortOrder,
      note: updated.note,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; componentId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được xóa cấu kiện" }, { status: 403 });
  }

  const component = await ensureAccess(params.id, params.componentId, user.id, user.role);
  if (!component) return NextResponse.json({ message: "Không tìm thấy cấu kiện" }, { status: 404 });

  const itemCount = await prisma.projectBudgetItem.count({ where: { componentId: component.id } });
  if (itemCount > 0) {
    return NextResponse.json(
      { message: `Cấu kiện đang có ${itemCount} công tác, hãy xóa hết công tác trước` },
      { status: 409 },
    );
  }

  await prisma.projectComponent.delete({ where: { id: component.id } });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "project_component",
    entityId: component.id,
    action: "delete",
    summary: `Xóa cấu kiện ${component.stage} — ${component.name}${component.floor ? ` (${component.floor})` : ""}`,
    metadata: { stage: component.stage, name: component.name, floor: component.floor },
  });

  return NextResponse.json({ ok: true });
}
