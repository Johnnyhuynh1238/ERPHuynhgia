import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canEditBudget } from "@/lib/project-budget";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  price: z.coerce.number().int().min(0).max(10_000_000_000).optional(),
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

  const existing = await prisma.materialPrice.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ message: "Không tồn tại" }, { status: 404 });

  const row = await prisma.materialPrice.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.unit !== undefined ? { unit: body.unit } : {}),
      ...(body.price !== undefined ? { price: BigInt(body.price) } : {}),
      ...(body.source !== undefined ? { source: body.source?.trim() || null } : {}),
      ...(body.note !== undefined ? { note: body.note?.trim() || null } : {}),
    },
  });

  return NextResponse.json({
    item: { id: row.id, name: row.name, unit: row.unit, price: Number(row.price), source: row.source, note: row.note },
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  await prisma.materialPrice.update({
    where: { id: params.id },
    data: { retiredAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
