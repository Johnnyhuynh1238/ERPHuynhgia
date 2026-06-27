import { NextResponse } from "next/server";
import { BudgetCategory, BudgetPhase, BudgetStatus, Prisma } from "@prisma/client";
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

const createSchema = z.object({
  componentId: z.string().uuid(),
  name: z.string().trim().min(1, "Tên công tác là bắt buộc").max(255),
  unit: z.string().trim().min(1, "Đơn vị là bắt buộc").max(20),
  quantity: z.coerce.number().min(0, "Khối lượng không hợp lệ"),
  laborUnitPrice: z.coerce.number().int().min(0).default(0),
  materialUnitPrice: z.coerce.number().int().min(0).default(0),
  equipmentUnitPrice: z.coerce.number().int().min(0).default(0),
  note: z.string().trim().max(500).optional().nullable(),
  sortRank: z.coerce.number().optional(),
  breakdown: z.array(breakdownSchema).max(200).optional().nullable(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được nhập dự toán" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const body = parsed.data;

  const component = await prisma.projectComponent.findFirst({
    where: { id: body.componentId, projectId: params.id },
  });
  if (!component) return NextResponse.json({ message: "Cấu kiện không tồn tại" }, { status: 404 });

  const breakdown = (body.breakdown ?? []).map((b) => ({
    name: b.name,
    quantity: Number(b.quantity) || 0,
    unitPrice: b.unitPrice == null ? null : Number(b.unitPrice),
    note: b.note ?? null,
  }));
  const breakdownSum = breakdown.reduce((s, b) => s + b.quantity, 0);
  const quantity = breakdown.length > 0 ? breakdownSum : body.quantity;

  const laborAmount = Math.round(quantity * body.laborUnitPrice);
  const materialAmount = Math.round(quantity * body.materialUnitPrice);
  const equipmentAmount = Math.round(quantity * body.equipmentUnitPrice);
  const amount = laborAmount + materialAmount + equipmentAmount;

  let item;
  try {
    item = await prisma.$transaction(async (tx) => {
      const existing = await tx.projectBudget.findUnique({ where: { projectId: params.id } });
      if (existing && existing.status === BudgetStatus.locked) throw new Error("LOCKED");

      const budget = existing
        ? existing
        : await tx.projectBudget.create({
            data: {
              projectId: params.id,
              createdById: user.id,
              totalLabor: BigInt(0),
              totalMaterial: BigInt(0),
              totalEquipment: BigInt(0),
              totalAmount: BigInt(0),
            },
          });

      const sortRank =
        body.sortRank ??
        ((
          await tx.projectBudgetItem.aggregate({
            where: { budgetId: budget.id, componentId: body.componentId },
            _max: { sortRank: true },
          })
        )._max.sortRank ?? -1) + 1;

      const created = await tx.projectBudgetItem.create({
        data: {
          budgetId: budget.id,
          componentId: body.componentId,
          stage: component.stage,
          // legacy required fields — set defaults for backward compat
          category: BudgetCategory.labor,
          phase: BudgetPhase.mong,
          phaseCode: "02",
          name: body.name,
          unit: body.unit,
          quantity: new Prisma.Decimal(quantity),
          unitPrice: BigInt(body.laborUnitPrice),
          amount: BigInt(amount),
          note: body.note?.trim() ? body.note.trim() : null,
          sortRank,
          breakdown:
            breakdown.length > 0
              ? (breakdown as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          laborUnitPrice: BigInt(body.laborUnitPrice),
          laborAmount: BigInt(laborAmount),
          materialUnitPrice: BigInt(body.materialUnitPrice),
          materialAmount: BigInt(materialAmount),
          equipmentUnitPrice: BigInt(body.equipmentUnitPrice),
          equipmentAmount: BigInt(equipmentAmount),
        },
      });

      await recomputeBudgetTotals(tx, budget.id);
      return created;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "LOCKED") {
      return NextResponse.json({ message: "Dự toán đã chốt, không thể chỉnh sửa" }, { status: 409 });
    }
    throw err;
  }

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "project_budget_item",
    entityId: item.id,
    action: "create",
    summary: `Thêm công tác ${component.stage} — ${component.name} / ${body.name} (${quantity} ${body.unit}, ${amount.toLocaleString("vi-VN")}đ)`,
    metadata: { componentId: component.id, stage: component.stage, name: body.name, amount },
  });

  return NextResponse.json({
    item: {
      id: item.id,
      componentId: item.componentId,
      stage: item.stage,
      name: item.name,
      unit: item.unit,
      quantity: Number(item.quantity),
      laborUnitPrice: Number(item.laborUnitPrice),
      laborAmount: Number(item.laborAmount),
      materialUnitPrice: Number(item.materialUnitPrice),
      materialAmount: Number(item.materialAmount),
      equipmentUnitPrice: Number(item.equipmentUnitPrice),
      equipmentAmount: Number(item.equipmentAmount),
      amount: Number(item.amount),
      note: item.note,
      sortRank: item.sortRank,
    },
  }, { status: 201 });
}
