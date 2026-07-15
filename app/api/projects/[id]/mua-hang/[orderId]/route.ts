import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMuaHang } from "@/lib/estimate";

export const runtime = "nodejs";

type OrderItem = { key: string; name: string; unit: string; qty: number; price: number };

const STATUSES = ["draft", "ordered", "received", "paid"] as const;
type St = (typeof STATUSES)[number];

// PATCH: sửa mọi thứ TRỪ số lượng (SL khoá). Body có thể có:
//   supplierName, supplierId, status, orderDate(ISO), deliveryDate("YYYY-MM-DD"|null),
//   note, prices(number[] khớp thứ tự items — chỉ đổi đơn giá, tính lại total).
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; orderId: string } },
) {
  const { isKeToan, error } = await requireMuaHang();
  if (error) return error;

  const order = await prisma.mhOrder.findFirst({
    where: { id: params.orderId, projectId: params.id },
  });
  if (!order) return NextResponse.json({ message: "Không thấy đơn" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if ("supplierName" in body) data.supplierName = String(body.supplierName || "").trim() || null;
  if ("supplierId" in body) data.supplierId = body.supplierId ? String(body.supplierId) : null;
  if ("note" in body) data.note = String(body.note || "").trim() || null;

  if (typeof body.status === "string" && (STATUSES as readonly string[]).includes(body.status)) {
    data.status = body.status as St;
  }
  if (typeof body.orderDate === "string") {
    const d = new Date(body.orderDate);
    if (!isNaN(d.getTime())) data.orderDate = d;
  }
  if ("deliveryDate" in body) {
    const v = body.deliveryDate;
    if (!v) data.deliveryDate = null;
    else {
      const d = new Date(String(v));
      if (!isNaN(d.getTime())) data.deliveryDate = d;
    }
  }

  // Đơn giá: KHÔNG đụng qty. Cập nhật price theo index rồi tính lại total.
  // Kế toán không được đặt giá (giá do admin quy định trong dự toán) → bỏ qua prices.
  if (Array.isArray(body.prices) && !isKeToan) {
    const items = (order.items as unknown as OrderItem[]).map((it, i) => {
      const p = Math.round(Number((body.prices as unknown[])[i]));
      return { ...it, price: Number.isFinite(p) && p >= 0 ? p : it.price };
    });
    data.items = items;
    data.total = items.reduce((s, it) => s + it.qty * it.price, 0);
  }

  const updated = await prisma.mhOrder.update({ where: { id: order.id }, data });
  return NextResponse.json({ id: updated.id, total: Number(updated.total), status: updated.status });
}

// DELETE: xoá đơn (số đã đặt sẽ trừ lại ở client vì tính từ danh sách đơn).
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; orderId: string } },
) {
  const { error } = await requireMuaHang();
  if (error) return error;

  const res = await prisma.mhOrder.deleteMany({
    where: { id: params.orderId, projectId: params.id },
  });
  if (!res.count) return NextResponse.json({ message: "Không thấy đơn" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
