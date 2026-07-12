import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// 1 dòng vật tư trong đơn (snapshot từ dự toán khi tạo — SL khoá).
type OrderItem = { key: string; name: string; unit: string; qty: number; price: number };

function cleanItems(raw: unknown): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  const out: OrderItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const qty = Number(o.qty);
    const price = Math.round(Number(o.price) || 0);
    const name = String(o.name || "").trim();
    const unit = String(o.unit || "").trim();
    const key = String(o.key || `${name}|${unit}`);
    if (!name || !(qty > 0)) continue;
    out.push({ key, name, unit, qty, price: price >= 0 ? price : 0 });
  }
  return out;
}

const money = (items: OrderItem[]) => items.reduce((s, it) => s + it.qty * it.price, 0);

// GET: toàn bộ đơn mua hàng của dự án (mới nhất trước).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const orders = await prisma.mhOrder.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    items: orders.map((o) => ({
      id: o.id,
      seq: o.seq,
      status: o.status,
      supplierId: o.supplierId,
      supplierName: o.supplierName,
      orderDate: o.orderDate,
      deliveryDate: o.deliveryDate,
      note: o.note,
      total: Number(o.total),
      items: o.items,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    })),
  });
}

// POST: tạo đơn mới. Body { items:[{key,name,unit,qty,price}], supplierName?, note? }.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    items?: unknown;
    supplierName?: string;
    note?: string;
  };
  const items = cleanItems(body.items);
  if (!items.length) {
    return NextResponse.json({ message: "Đơn phải có ít nhất 1 vật tư (SL > 0)" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ message: "Không thấy dự án" }, { status: 404 });

  const last = await prisma.mhOrder.findFirst({
    where: { projectId: params.id },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  const seq = (last?.seq || 0) + 1;

  const order = await prisma.mhOrder.create({
    data: {
      projectId: params.id,
      seq,
      status: "ordered",
      supplierName: body.supplierName?.trim() || null,
      note: body.note?.trim() || null,
      total: money(items),
      items,
      createdBy: user!.id,
    },
  });

  return NextResponse.json({ id: order.id, seq: order.seq });
}
