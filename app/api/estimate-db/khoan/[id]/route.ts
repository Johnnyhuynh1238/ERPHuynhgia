import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

type Patch = {
  name?: string;
  unit?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  value?: number | null;
  contractor?: string | null;
  note?: string | null;
};

// PATCH: sửa 1 hạng mục khoán
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const b = (await req.json()) as Patch;
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const n = b.name.trim();
    if (!n) return NextResponse.json({ message: "Tên không được rỗng" }, { status: 400 });
    data.name = n;
  }
  if (b.unit !== undefined) data.unit = b.unit?.trim() || null;
  if (b.quantity !== undefined) data.quantity = b.quantity;
  if (b.unitPrice !== undefined) data.unitPrice = b.unitPrice != null ? BigInt(Math.round(b.unitPrice)) : null;
  if (b.value !== undefined) data.value = b.value != null ? BigInt(Math.round(b.value)) : BigInt(0);
  if (b.contractor !== undefined) data.contractor = b.contractor?.trim() || null;
  if (b.note !== undefined) data.note = b.note?.trim() || null;

  const updated = await prisma.estimateDbKhoan.update({ where: { id: params.id }, data });
  return NextResponse.json({
    id: updated.id,
    value: Number(updated.value),
    unitPrice: updated.unitPrice != null ? Number(updated.unitPrice) : null,
    quantity: updated.quantity != null ? Number(updated.quantity) : null,
  });
}

// DELETE: xoá 1 hạng mục khoán
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;
  await prisma.estimateDbKhoan.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
