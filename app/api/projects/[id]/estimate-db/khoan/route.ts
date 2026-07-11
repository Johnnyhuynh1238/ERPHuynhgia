import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

type KhoanBody = {
  name?: string;
  unit?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  value?: number | null;
  contractor?: string | null;
  note?: string | null;
};

const serialize = (k: {
  id: string;
  name: string;
  unit: string | null;
  quantity: unknown;
  unitPrice: bigint | null;
  value: bigint;
  contractor: string | null;
  note: string | null;
  sortOrder: number;
}) => ({
  id: k.id,
  name: k.name,
  unit: k.unit,
  quantity: k.quantity != null ? Number(k.quantity) : null,
  unitPrice: k.unitPrice != null ? Number(k.unitPrice) : null,
  value: Number(k.value),
  contractor: k.contractor,
  note: k.note,
  sortOrder: k.sortOrder,
});

// GET: danh sách hạng mục khoán của dự án
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await prisma.estimateDbKhoan.findMany({
    where: { projectId: params.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const items = rows.map(serialize);
  const total = items.reduce((s, r) => s + r.value, 0);
  return NextResponse.json({ items, total });
}

// POST: tạo 1 hạng mục khoán
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = (await req.json()) as KhoanBody;
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ message: "Thiếu tên hạng mục" }, { status: 400 });

  const max = await prisma.estimateDbKhoan.aggregate({
    where: { projectId: params.id },
    _max: { sortOrder: true },
  });

  const created = await prisma.estimateDbKhoan.create({
    data: {
      projectId: params.id,
      name,
      unit: body.unit?.trim() || null,
      quantity: body.quantity != null ? body.quantity : null,
      unitPrice: body.unitPrice != null ? BigInt(Math.round(body.unitPrice)) : null,
      value: body.value != null ? BigInt(Math.round(body.value)) : BigInt(0),
      contractor: body.contractor?.trim() || null,
      note: body.note?.trim() || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  return NextResponse.json(serialize(created));
}
