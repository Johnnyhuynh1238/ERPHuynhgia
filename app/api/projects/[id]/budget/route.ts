import { NextResponse } from "next/server";
import { BudgetCategory, BudgetPhase, BudgetStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditBudget, canViewBudget } from "@/lib/project-budget";
import { logProjectActivity } from "@/lib/project-activity-log";

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  category: z.nativeEnum(BudgetCategory),
  phase: z.nativeEnum(BudgetPhase),
  name: z.string().trim().min(1, "Tên hạng mục là bắt buộc").max(255),
  unit: z.string().trim().min(1, "Đơn vị là bắt buộc").max(20),
  quantity: z.coerce.number().min(0, "Khối lượng không hợp lệ"),
  unitPrice: z.coerce.number().int().min(0, "Đơn giá không hợp lệ"),
  note: z.string().trim().max(500).optional().nullable(),
  sortRank: z.coerce.number().optional(),
});

const putSchema = z.object({
  note: z.string().max(2000).optional().nullable(),
  items: z.array(itemSchema).max(500),
});

type SerializedItem = {
  id: string;
  category: BudgetCategory;
  phase: BudgetPhase;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note: string | null;
  sortRank: number;
};

type SerializedAmendmentItem = Omit<SerializedItem, "sortRank">;

function serializeItem(item: {
  id: string;
  category: BudgetCategory;
  phase: BudgetPhase;
  name: string;
  unit: string;
  quantity: Prisma.Decimal | number;
  unitPrice: bigint;
  amount: bigint;
  note: string | null;
  sortRank: number;
}): SerializedItem {
  return {
    id: item.id,
    category: item.category,
    phase: item.phase,
    name: item.name,
    unit: item.unit,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    amount: Number(item.amount),
    note: item.note,
    sortRank: item.sortRank,
  };
}

function serializeAmendmentItem(item: {
  id: string;
  category: BudgetCategory;
  phase: BudgetPhase;
  name: string;
  unit: string;
  quantity: Prisma.Decimal | number;
  unitPrice: bigint;
  amount: bigint;
  note: string | null;
}): SerializedAmendmentItem {
  return {
    id: item.id,
    category: item.category,
    phase: item.phase,
    name: item.name,
    unit: item.unit,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    amount: Number(item.amount),
    note: item.note,
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true, customerName: true, contractValue: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const budget = await prisma.projectBudget.findUnique({
    where: { projectId: params.id },
    include: {
      items: { orderBy: [{ category: "asc" }, { phase: "asc" }, { sortRank: "asc" }] },
      createdBy: { select: { id: true, fullName: true } },
      lockedBy: { select: { id: true, fullName: true } },
      amendments: {
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
          proposedBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  return NextResponse.json({
    project: {
      ...project,
      contractValue: project.contractValue ? Number(project.contractValue) : null,
    },
    budget: budget
      ? {
          id: budget.id,
          status: budget.status,
          totalLabor: Number(budget.totalLabor),
          totalMaterial: Number(budget.totalMaterial),
          totalEquipment: Number(budget.totalEquipment),
          totalAmount: Number(budget.totalAmount),
          note: budget.note,
          createdBy: budget.createdBy,
          lockedBy: budget.lockedBy,
          lockedAt: budget.lockedAt,
          createdAt: budget.createdAt,
          updatedAt: budget.updatedAt,
          items: budget.items.map(serializeItem),
          amendments: budget.amendments.map((a) => ({
            id: a.id,
            reason: a.reason,
            status: a.status,
            deltaLabor: Number(a.deltaLabor),
            deltaMaterial: Number(a.deltaMaterial),
            deltaEquipment: Number(a.deltaEquipment),
            deltaAmount: Number(a.deltaAmount),
            proposedBy: a.proposedBy,
            approvedBy: a.approvedBy,
            approvedAt: a.approvedAt,
            rejectReason: a.rejectReason,
            createdAt: a.createdAt,
            items: a.items.map(serializeAmendmentItem),
          })),
        }
      : null,
  });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
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

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;
  const items = payload.items.map((it, index) => ({
    ...it,
    sortRank: it.sortRank ?? index,
    amount: Math.round(it.quantity * it.unitPrice),
  }));
  const totalLabor = items.filter((i) => i.category === "labor").reduce((s, i) => s + i.amount, 0);
  const totalMaterial = items.filter((i) => i.category === "material").reduce((s, i) => s + i.amount, 0);
  const totalEquipment = items.filter((i) => i.category === "equipment").reduce((s, i) => s + i.amount, 0);
  const totalAmount = totalLabor + totalMaterial + totalEquipment;

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectBudget.findUnique({ where: { projectId: params.id } });
    if (existing && existing.status === BudgetStatus.locked) {
      throw new Error("LOCKED");
    }

    const budget = existing
      ? await tx.projectBudget.update({
          where: { id: existing.id },
          data: {
            note: payload.note ?? null,
            totalLabor: BigInt(totalLabor),
            totalMaterial: BigInt(totalMaterial),
            totalEquipment: BigInt(totalEquipment),
            totalAmount: BigInt(totalAmount),
          },
        })
      : await tx.projectBudget.create({
          data: {
            projectId: params.id,
            createdById: user.id,
            note: payload.note ?? null,
            totalLabor: BigInt(totalLabor),
            totalMaterial: BigInt(totalMaterial),
            totalEquipment: BigInt(totalEquipment),
            totalAmount: BigInt(totalAmount),
          },
        });

    await tx.projectBudgetItem.deleteMany({ where: { budgetId: budget.id } });
    if (items.length > 0) {
      await tx.projectBudgetItem.createMany({
        data: items.map((it) => ({
          budgetId: budget.id,
          category: it.category,
          phase: it.phase,
          name: it.name,
          unit: it.unit,
          quantity: new Prisma.Decimal(it.quantity),
          unitPrice: BigInt(it.unitPrice),
          amount: BigInt(it.amount),
          note: it.note ?? null,
          sortRank: it.sortRank,
        })),
      });
    }

    return budget;
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
    entity: "project_budget",
    entityId: result.id,
    action: "update",
    summary: `Cập nhật dự toán: NC ${totalLabor.toLocaleString("vi-VN")}đ + VT ${totalMaterial.toLocaleString("vi-VN")}đ + MM ${totalEquipment.toLocaleString("vi-VN")}đ = ${totalAmount.toLocaleString("vi-VN")}đ`,
    metadata: { totalLabor, totalMaterial, totalEquipment, totalAmount, itemCount: items.length },
  });

  return NextResponse.json({ ok: true, totals: { totalLabor, totalMaterial, totalEquipment, totalAmount } });
}
