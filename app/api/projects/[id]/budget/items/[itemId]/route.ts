import { NextResponse } from "next/server";
import { BudgetStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditBudget, recomputeBudgetTotals } from "@/lib/project-budget";
import { logProjectActivity } from "@/lib/project-activity-log";

const breakdownSchema = z.object({
  name: z.string().trim().min(1).max(255),
  quantity: z.coerce.number().min(0),
  unitPrice: z.coerce.number().int().min(0).optional(),
  note: z.string().trim().max(255).optional().nullable(),
});

const patchSchema = z.object({
  componentId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(255).optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  quantity: z.coerce.number().min(0).optional(),
  laborUnitPrice: z.coerce.number().int().min(0).optional(),
  materialUnitPrice: z.coerce.number().int().min(0).optional(),
  equipmentUnitPrice: z.coerce.number().int().min(0).optional(),
  note: z.string().trim().max(500).optional().nullable(),
  sortRank: z.coerce.number().optional(),
  breakdown: z.array(breakdownSchema).max(200).optional().nullable(),
});

async function loadItem(projectId: string, itemId: string, userId: string, role: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...buildProjectAccessWhere({ id: userId, role }) },
    select: { id: true },
  });
  if (!project) return null;
  const item = await prisma.projectBudgetItem.findFirst({
    where: { id: itemId, budget: { projectId } },
    include: { budget: true, component: true },
  });
  return item;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; itemId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được sửa dự toán" }, { status: 403 });
  }

  const item = await loadItem(params.id, params.itemId, user.id, user.role);
  if (!item) return NextResponse.json({ message: "Không tìm thấy công tác" }, { status: 404 });
  if (item.budget.status === BudgetStatus.locked) {
    return NextResponse.json({ message: "Dự toán đã chốt, không thể chỉnh sửa" }, { status: 409 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const body = parsed.data;

  // Resolve componentId (có thể đổi sang cấu kiện khác → stage đổi)
  let component = item.component;
  if (body.componentId && body.componentId !== item.componentId) {
    component = await prisma.projectComponent.findFirst({
      where: { id: body.componentId, projectId: params.id },
    });
    if (!component) return NextResponse.json({ message: "Cấu kiện không tồn tại" }, { status: 404 });
  }

  // Compute new values
  const laborUnitPrice = body.laborUnitPrice ?? Number(item.laborUnitPrice);
  const materialUnitPrice = body.materialUnitPrice ?? Number(item.materialUnitPrice);
  const equipmentUnitPrice = body.equipmentUnitPrice ?? Number(item.equipmentUnitPrice);

  let breakdown: { name: string; quantity: number; unitPrice: number | null; note: string | null }[] | null;
  if (body.breakdown !== undefined) {
    breakdown = (body.breakdown ?? []).map((b) => ({
      name: b.name,
      quantity: Number(b.quantity) || 0,
      unitPrice: b.unitPrice == null ? null : Number(b.unitPrice),
      note: b.note ?? null,
    }));
  } else {
    const existingBd = item.breakdown;
    if (Array.isArray(existingBd)) {
      breakdown = existingBd
        .filter((b) => b != null && typeof b === "object" && !Array.isArray(b))
        .map((b) => {
          const obj = b as Record<string, unknown>;
          return {
            name: String(obj.name ?? ""),
            quantity: Number(obj.quantity ?? 0),
            unitPrice: obj.unitPrice == null ? null : Number(obj.unitPrice),
            note: typeof obj.note === "string" ? obj.note : null,
          };
        });
    } else {
      breakdown = null;
    }
  }

  const breakdownSum = (breakdown ?? []).reduce((s, b) => s + b.quantity, 0);
  const quantity =
    breakdown && breakdown.length > 0
      ? breakdownSum
      : (body.quantity ?? Number(item.quantity));

  const laborAmount = Math.round(quantity * laborUnitPrice);
  const materialAmount = Math.round(quantity * materialUnitPrice);
  const equipmentAmount = Math.round(quantity * equipmentUnitPrice);
  const amount = laborAmount + materialAmount + equipmentAmount;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.projectBudgetItem.update({
      where: { id: item.id },
      data: {
        ...(component ? { componentId: component.id, stage: component.stage } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.unit !== undefined ? { unit: body.unit } : {}),
        quantity: new Prisma.Decimal(quantity),
        unitPrice: BigInt(laborUnitPrice),
        amount: BigInt(amount),
        laborUnitPrice: BigInt(laborUnitPrice),
        laborAmount: BigInt(laborAmount),
        materialUnitPrice: BigInt(materialUnitPrice),
        materialAmount: BigInt(materialAmount),
        equipmentUnitPrice: BigInt(equipmentUnitPrice),
        equipmentAmount: BigInt(equipmentAmount),
        ...(body.note !== undefined
          ? { note: body.note?.trim() ? body.note.trim() : null }
          : {}),
        ...(body.sortRank !== undefined ? { sortRank: body.sortRank } : {}),
        breakdown:
          breakdown && breakdown.length > 0
            ? (breakdown as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
    await recomputeBudgetTotals(tx, item.budgetId);
    return u;
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "project_budget_item",
    entityId: updated.id,
    action: "update",
    summary: `Sửa công tác ${updated.stage ?? ""} — ${updated.name} (${amount.toLocaleString("vi-VN")}đ)`,
    metadata: { amount, quantity, laborUnitPrice, materialUnitPrice, equipmentUnitPrice },
  });

  return NextResponse.json({
    item: {
      id: updated.id,
      componentId: updated.componentId,
      stage: updated.stage,
      name: updated.name,
      unit: updated.unit,
      quantity: Number(updated.quantity),
      laborUnitPrice: Number(updated.laborUnitPrice),
      laborAmount: Number(updated.laborAmount),
      materialUnitPrice: Number(updated.materialUnitPrice),
      materialAmount: Number(updated.materialAmount),
      equipmentUnitPrice: Number(updated.equipmentUnitPrice),
      equipmentAmount: Number(updated.equipmentAmount),
      amount: Number(updated.amount),
      note: updated.note,
      sortRank: updated.sortRank,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; itemId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được xóa dự toán" }, { status: 403 });
  }

  const item = await loadItem(params.id, params.itemId, user.id, user.role);
  if (!item) return NextResponse.json({ message: "Không tìm thấy công tác" }, { status: 404 });
  if (item.budget.status === BudgetStatus.locked) {
    return NextResponse.json({ message: "Dự toán đã chốt, không thể xóa" }, { status: 409 });
  }

  // Chặn xóa nếu đã có WorkOrder gắn vào item này
  const woCount = await prisma.workOrder.count({ where: { budgetItemId: item.id } });
  if (woCount > 0) {
    return NextResponse.json(
      { message: `Công tác đã có ${woCount} phiếu giao việc, không thể xóa` },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectBudgetItem.delete({ where: { id: item.id } });
    await recomputeBudgetTotals(tx, item.budgetId);
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "project_budget_item",
    entityId: item.id,
    action: "delete",
    summary: `Xóa công tác ${item.stage ?? ""} — ${item.name} (${Number(item.amount).toLocaleString("vi-VN")}đ)`,
    metadata: { stage: item.stage, name: item.name, amount: Number(item.amount) },
  });

  return NextResponse.json({ ok: true });
}
