import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireMuaHang } from "@/lib/estimate";

export const runtime = "nodejs";

type MatBody = {
  catalogId?: string | null;
  categoryId?: string | null;
  name?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number | null;
  note?: string | null;
};

// GET: toàn bộ VT của dự án (flat) kèm tên công tác + chủng loại — client tự lọc/gộp.
// Lọc tuỳ chọn: ?catalogId=… &categoryId=…
export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Kế toán cần đọc VT dự toán để mua hàng (chỉ đọc; POST/sửa vẫn admin).
  const { error } = await requireMuaHang();
  if (error) return error;

  const url = new URL(req.url);
  const catalogId = url.searchParams.get("catalogId") || undefined;
  const categoryId = url.searchParams.get("categoryId") || undefined;

  const rows = await prisma.estimateDbMaterial.findMany({
    where: { projectId: params.id, catalogId, categoryId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      catalog: { select: { phaseCode: true, taskCode: true, taskName: true } },
      category: { select: { name: true } },
    },
  });

  const items = rows.map((r) => {
    const qty = Number(r.quantity);
    const price = Number(r.unitPrice);
    return {
      id: r.id,
      catalogId: r.catalogId,
      taskCode: r.catalog ? `${r.catalog.phaseCode}-${r.catalog.taskCode}` : null,
      taskName: r.catalog?.taskName ?? null,
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? null,
      name: r.name,
      unit: r.unit,
      quantity: qty,
      unitPrice: price,
      amount: qty * price,
      note: r.note,
      taskNote: r.taskNote,
    };
  });
  const total = items.reduce((s, r) => s + r.amount, 0);
  return NextResponse.json({ items, total });
}

// POST: thêm 1 dòng vật tư
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const b = (await req.json()) as MatBody;
  const name = b.name?.trim();
  const unit = b.unit?.trim();
  if (!name) return NextResponse.json({ message: "Thiếu tên vật tư" }, { status: 400 });
  if (!unit) return NextResponse.json({ message: "Thiếu đơn vị" }, { status: 400 });

  const max = await prisma.estimateDbMaterial.aggregate({
    where: { projectId: params.id },
    _max: { sortOrder: true },
  });

  const created = await prisma.estimateDbMaterial.create({
    data: {
      projectId: params.id,
      catalogId: b.catalogId || null,
      categoryId: b.categoryId || null,
      name,
      unit,
      quantity: b.quantity ?? 0,
      unitPrice: b.unitPrice != null ? BigInt(Math.round(b.unitPrice)) : BigInt(0),
      note: b.note?.trim() || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  return NextResponse.json({ id: created.id });
}
