import { NextResponse } from "next/server";
import { AmendmentStatus, BudgetCategory, BudgetStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canProposeAmendment, phaseCodeToLegacyPhase, type PhaseCode } from "@/lib/project-budget";
import { logProjectActivity } from "@/lib/project-activity-log";

const itemSchema = z.object({
  category: z.nativeEnum(BudgetCategory),
  phaseCode: z.string().regex(/^0[1-9]$/, "Mã giai đoạn phải là 01..09"),
  name: z.string().trim().min(1).max(255),
  unit: z.string().trim().min(1).max(20),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number().int(),
  note: z.string().trim().max(500).optional().nullable(),
});

const createSchema = z.object({
  reason: z.string().trim().min(3, "Lý do tối thiểu 3 ký tự").max(2000),
  items: z.array(itemSchema).min(1, "Cần ít nhất 1 hạng mục điều chỉnh"),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canProposeAmendment({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được đề xuất điều chỉnh" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const budget = await prisma.projectBudget.findUnique({ where: { projectId: params.id } });
  if (!budget) return NextResponse.json({ message: "Chưa có dự toán" }, { status: 404 });
  if (budget.status !== BudgetStatus.locked) {
    return NextResponse.json({ message: "Phải chốt dự toán trước khi đề xuất điều chỉnh" }, { status: 409 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const items = parsed.data.items.map((it) => ({
    category: it.category,
    phaseCode: it.phaseCode as PhaseCode,
    phase: phaseCodeToLegacyPhase(it.phaseCode as PhaseCode),
    name: it.name,
    unit: it.unit,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    note: it.note ?? null,
    amount: Math.round(it.quantity * it.unitPrice),
  }));
  const deltaLabor = items.filter((i) => i.category === "labor").reduce((s, i) => s + i.amount, 0);
  const deltaMaterial = items.filter((i) => i.category === "material").reduce((s, i) => s + i.amount, 0);
  const deltaEquipment = items.filter((i) => i.category === "equipment").reduce((s, i) => s + i.amount, 0);
  const deltaAmount = deltaLabor + deltaMaterial + deltaEquipment;

  const amendment = await prisma.projectBudgetAmendment.create({
    data: {
      budgetId: budget.id,
      reason: parsed.data.reason,
      deltaLabor: BigInt(deltaLabor),
      deltaMaterial: BigInt(deltaMaterial),
      deltaEquipment: BigInt(deltaEquipment),
      deltaAmount: BigInt(deltaAmount),
      proposedById: user.id,
      items: {
        create: items.map((it) => ({
          category: it.category,
          phase: it.phase,
          phaseCode: it.phaseCode,
          name: it.name,
          unit: it.unit,
          quantity: new Prisma.Decimal(it.quantity),
          unitPrice: BigInt(it.unitPrice),
          amount: BigInt(it.amount),
          note: it.note,
        })),
      },
    },
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "project_budget_amendment",
    entityId: amendment.id,
    action: "create",
    summary: `Đề xuất điều chỉnh dự toán: ${deltaAmount >= 0 ? "+" : ""}${deltaAmount.toLocaleString("vi-VN")}đ — ${parsed.data.reason.slice(0, 80)}`,
    metadata: { deltaLabor, deltaMaterial, deltaEquipment, deltaAmount, status: AmendmentStatus.draft },
  });

  return NextResponse.json({ ok: true, amendmentId: amendment.id });
}
