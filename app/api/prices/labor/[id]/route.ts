import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canEditBudget } from "@/lib/project-budget";

const patchSchema = z.object({
  grade: z.string().trim().regex(/^[1-7](\.[0-9])?$/).max(16).optional(),
  price: z.coerce.number().int().min(0).max(10_000_000).optional(),
  source: z.string().trim().max(255).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const body = parsed.data;
  const row = await prisma.laborPrice.update({
    where: { id: params.id },
    data: {
      ...(body.grade !== undefined ? { grade: body.grade } : {}),
      ...(body.price !== undefined ? { price: BigInt(body.price) } : {}),
      ...(body.source !== undefined ? { source: body.source?.trim() || null } : {}),
      ...(body.note !== undefined ? { note: body.note?.trim() || null } : {}),
    },
  });
  return NextResponse.json({
    item: { id: row.id, grade: row.grade, price: Number(row.price), source: row.source, note: row.note },
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  await prisma.laborPrice.update({ where: { id: params.id }, data: { retiredAt: new Date() } });
  return NextResponse.json({ ok: true });
}
