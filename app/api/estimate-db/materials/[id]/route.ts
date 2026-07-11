import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

type Patch = {
  catalogId?: string | null;
  categoryId?: string | null;
  name?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number | null;
  note?: string | null;
};

// PATCH: sửa 1 dòng vật tư
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const b = (await req.json()) as Patch;
  const data: Record<string, unknown> = {};
  if (b.catalogId !== undefined) data.catalogId = b.catalogId || null;
  if (b.categoryId !== undefined) data.categoryId = b.categoryId || null;
  if (b.name !== undefined) {
    const n = b.name.trim();
    if (!n) return NextResponse.json({ message: "Tên không được rỗng" }, { status: 400 });
    data.name = n;
  }
  if (b.unit !== undefined) {
    const u = b.unit.trim();
    if (!u) return NextResponse.json({ message: "Đơn vị không được rỗng" }, { status: 400 });
    data.unit = u;
  }
  if (b.quantity !== undefined) data.quantity = b.quantity;
  if (b.unitPrice !== undefined) data.unitPrice = b.unitPrice != null ? BigInt(Math.round(b.unitPrice)) : BigInt(0);
  if (b.note !== undefined) data.note = b.note?.trim() || null;

  const updated = await prisma.estimateDbMaterial.update({ where: { id: params.id }, data });
  return NextResponse.json({
    id: updated.id,
    quantity: Number(updated.quantity),
    unitPrice: Number(updated.unitPrice),
    amount: Number(updated.quantity) * Number(updated.unitPrice),
  });
}

// DELETE: xoá 1 dòng vật tư
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;
  await prisma.estimateDbMaterial.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
