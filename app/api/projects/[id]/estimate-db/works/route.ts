import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireMuaHang } from "@/lib/estimate";

export const runtime = "nodejs";

type WorkBody = {
  sectionId?: string | null;
  name?: string;
  location?: string | null;
  unit?: string;
  quantity?: number;
  laborPrice?: number;
  note?: string | null;
};

// GET: công tác dự toán (KL + đơn giá khoán NC). TT NC = KL × đơn giá (tính runtime).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireMuaHang();
  if (error) return error;

  const rows = await prisma.estimateWork.findMany({
    where: { projectId: params.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const items = rows.map((r) => {
    const quantity = Number(r.quantity);
    const laborPrice = Number(r.laborPrice);
    return {
      id: r.id,
      sectionId: r.sectionId,
      name: r.name,
      location: r.location,
      unit: r.unit,
      quantity,
      laborPrice,
      laborAmount: Math.round(quantity * laborPrice),
      note: r.note,
      sortOrder: r.sortOrder,
    };
  });
  const laborTotal = items.reduce((s, r) => s + r.laborAmount, 0);
  return NextResponse.json({ items, laborTotal });
}

// POST: thêm 1 công tác
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const b = (await req.json()) as WorkBody;
  const name = b.name?.trim();
  const unit = b.unit?.trim();
  if (!name) return NextResponse.json({ message: "Thiếu tên công tác" }, { status: 400 });
  if (!unit) return NextResponse.json({ message: "Thiếu đơn vị" }, { status: 400 });

  const max = await prisma.estimateWork.aggregate({
    where: { projectId: params.id },
    _max: { sortOrder: true },
  });
  const created = await prisma.estimateWork.create({
    data: {
      projectId: params.id,
      sectionId: b.sectionId || null,
      name,
      location: b.location?.trim() || null,
      unit,
      quantity: b.quantity ?? 0,
      laborPrice: BigInt(Math.round(b.laborPrice ?? 0)),
      note: b.note?.trim() || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  return NextResponse.json({ id: created.id });
}
