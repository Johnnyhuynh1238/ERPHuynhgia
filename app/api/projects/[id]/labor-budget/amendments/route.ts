import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import {
  canProposeAmendment,
  computeItemAmount,
  isValidPhase,
} from "@/lib/labor-budget";

const itemSchema = z.object({
  phase: z.enum(["mong", "than", "mai"]),
  workItem: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(20),
  quantity: z.number().positive(),
  unitPrice: z.number().int().nonnegative(),
  note: z.string().trim().max(500).optional().nullable(),
});

const bodySchema = z.object({
  reason: z.string().trim().min(5, "Lý do tối thiểu 5 ký tự").max(500),
  items: z.array(itemSchema).min(1, "Phải có ít nhất 1 đầu việc bổ sung"),
});

type RouteCtx = { params: { id: string } };

export async function POST(req: Request, ctx: RouteCtx) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!canProposeAmendment(user.role)) {
    return NextResponse.json({ message: "Không có quyền đề xuất điều chỉnh" }, { status: 403 });
  }

  const accessWhere = buildProjectAccessWhere({ id: user.id, role: user.role });
  const project = await prisma.project.findFirst({
    where: { id: ctx.params.id, ...accessWhere },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ message: "Dự án không tồn tại hoặc không có quyền" }, { status: 404 });
  }

  const budget = await prisma.laborBudget.findUnique({ where: { projectId: project.id } });
  if (!budget) {
    return NextResponse.json({ message: "Chưa có dự toán" }, { status: 400 });
  }
  if (budget.status !== "locked") {
    return NextResponse.json({ message: "Chỉ điều chỉnh sau khi dự toán đã chốt" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Body không hợp lệ" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  for (const it of parsed.data.items) {
    if (!isValidPhase(it.phase)) {
      return NextResponse.json({ message: `Giai đoạn không hợp lệ: ${it.phase}` }, { status: 400 });
    }
  }

  const existingDraft = await prisma.budgetAmendment.findFirst({
    where: { budgetId: budget.id, status: "draft" },
    select: { id: true },
  });
  if (existingDraft) {
    return NextResponse.json({ message: "Đã có 1 điều chỉnh đang chờ duyệt — xử lý xong trước khi tạo mới" }, { status: 409 });
  }

  const enriched = parsed.data.items.map((it) => ({
    ...it,
    amount: computeItemAmount(it.quantity, it.unitPrice),
  }));
  const delta = enriched.reduce((s, it) => s + it.amount, 0);

  const amendment = await prisma.$transaction(async (tx) => {
    const a = await tx.budgetAmendment.create({
      data: {
        budgetId: budget.id,
        reason: parsed.data.reason,
        deltaAmount: BigInt(delta),
        status: "draft",
        proposedById: user.id,
      },
    });
    await tx.budgetAmendmentItem.createMany({
      data: enriched.map((it) => ({
        amendmentId: a.id,
        phase: it.phase,
        workItem: it.workItem,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: BigInt(it.unitPrice),
        amount: BigInt(it.amount),
        note: it.note ?? null,
      })),
    });
    return a;
  });

  return NextResponse.json({ ok: true, amendmentId: amendment.id });
}
