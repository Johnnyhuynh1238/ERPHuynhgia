import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function canAccess(role: string | undefined) {
  return role === UserRole.admin || role === UserRole.accountant;
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const patchSchema = z.object({
  plannedDate: dateStr.nullable().optional(), // null = trả về "chưa kế hoạch"
  amount: z.coerce.number().positive().optional(),
  title: z.string().trim().max(255).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

// PATCH 1 đợt kế hoạch (đổi ngày / số tiền). Xoá ngày → về cột chưa kế hoạch.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!canAccess(user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const b = parsed.data;

  const data: Prisma.CashPlanItemUpdateInput = {};
  if (b.plannedDate !== undefined)
    data.plannedDate = b.plannedDate ? new Date(`${b.plannedDate}T00:00:00Z`) : null;
  if (b.amount !== undefined) data.amount = new Prisma.Decimal(b.amount);
  if (b.title !== undefined) data.title = b.title;
  if (b.note !== undefined) data.note = b.note;

  await prisma.cashPlanItem.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

// DELETE 1 đợt; ?series=1 xoá cả chuỗi định kỳ (recurGroupId).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!canAccess(user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const series = new URL(req.url).searchParams.get("series") === "1";
  const item = await prisma.cashPlanItem.findUnique({
    where: { id: params.id },
    select: { recurGroupId: true },
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (series && item.recurGroupId) {
    await prisma.cashPlanItem.deleteMany({ where: { recurGroupId: item.recurGroupId } });
  } else {
    await prisma.cashPlanItem.delete({ where: { id: params.id } });
  }
  return NextResponse.json({ ok: true });
}
