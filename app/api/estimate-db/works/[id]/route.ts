import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

type Patch = {
  sectionId?: string | null;
  name?: string;
  location?: string | null;
  unit?: string;
  quantity?: number;
  laborPrice?: number;
  note?: string | null;
};

// PATCH: sửa 1 công tác (KL, đơn giá khoán NC, phần…)
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
  if (b.unit !== undefined) {
    const u = b.unit.trim();
    if (!u) return NextResponse.json({ message: "Đơn vị không được rỗng" }, { status: 400 });
    data.unit = u;
  }
  if (b.sectionId !== undefined) data.sectionId = b.sectionId || null;
  if (b.location !== undefined) data.location = b.location?.trim() || null;
  if (b.quantity !== undefined) data.quantity = Number(b.quantity) || 0;
  if (b.laborPrice !== undefined) data.laborPrice = BigInt(Math.round(Number(b.laborPrice) || 0));
  if (b.note !== undefined) data.note = b.note?.trim() || null;

  const r = await prisma.estimateWork.update({ where: { id: params.id }, data });
  const quantity = Number(r.quantity);
  const laborPrice = Number(r.laborPrice);
  return NextResponse.json({ id: r.id, quantity, laborPrice, laborAmount: Math.round(quantity * laborPrice) });
}

// DELETE: xoá 1 công tác — VT tiêu hao của công tác bị xoá theo (FK cascade).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;
  await prisma.estimateWork.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
