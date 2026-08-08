import { NextResponse } from "next/server";
import { BudgetPlanGroup, BudgetPlanStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildBudgetPlan } from "@/lib/budget-plan";

export const dynamic = "force-dynamic";

function canAccess(role: string | undefined) {
  return role === UserRole.admin || role === UserRole.accountant;
}

// GET: ngân sách + đã chi/công nợ per hạng mục.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!canAccess(user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const data = await buildBudgetPlan(params.id);
  return NextResponse.json(data);
}

const lineSchema = z.object({
  name: z.string().trim().min(1, "Tên hạng mục bắt buộc").max(255),
  groupKind: z.nativeEnum(BudgetPlanGroup),
  amount: z.coerce.number().int().min(0, "Ngân sách không hợp lệ"),
});
const putSchema = z.object({
  note: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(lineSchema).max(100),
});

// PUT: lưu/thay toàn bộ hạng mục (chỉ khi chưa khoá).
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!canAccess(user?.role) || !user?.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const { note, lines } = parsed.data;

  const existing = await prisma.projectBudgetPlan.findUnique({ where: { projectId: params.id } });
  if (existing?.status === BudgetPlanStatus.locked)
    return NextResponse.json({ error: "Ngân sách đã khoá, mở khoá để sửa" }, { status: 400 });

  const total = lines.reduce((s, l) => s + l.amount, 0);

  await prisma.$transaction(async (tx) => {
    const plan = await tx.projectBudgetPlan.upsert({
      where: { projectId: params.id },
      create: {
        projectId: params.id,
        note: note ?? null,
        totalAmount: BigInt(total),
        createdById: user.id,
      },
      update: { note: note ?? null, totalAmount: BigInt(total) },
    });
    await tx.projectBudgetPlanLine.deleteMany({ where: { planId: plan.id } });
    if (lines.length)
      await tx.projectBudgetPlanLine.createMany({
        data: lines.map((l, i) => ({
          planId: plan.id,
          name: l.name,
          groupKind: l.groupKind,
          amount: BigInt(l.amount),
          sortRank: i,
        })),
      });
  });

  return NextResponse.json({ ok: true });
}

const actionSchema = z.object({ action: z.enum(["lock", "unlock"]) });

// POST: khoá / mở khoá ngân sách.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== UserRole.admin || !user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });

  const plan = await prisma.projectBudgetPlan.findUnique({ where: { projectId: params.id } });
  if (!plan) return NextResponse.json({ error: "Chưa có ngân sách" }, { status: 404 });

  const lock = parsed.data.action === "lock";
  await prisma.projectBudgetPlan.update({
    where: { id: plan.id },
    data: {
      status: lock ? BudgetPlanStatus.locked : BudgetPlanStatus.draft,
      lockedById: lock ? user.id : null,
      lockedAt: lock ? new Date() : null,
    },
  });
  return NextResponse.json({ ok: true });
}
