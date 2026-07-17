import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMuaHang } from "@/lib/estimate";

export const runtime = "nodejs";

type OrderItem = { key: string; name: string; unit: string; qty: number; price: number };

const STATUSES = ["draft", "ordered", "received", "paid"] as const;
type St = (typeof STATUSES)[number];

// PATCH: sửa đơn. Body có thể có:
//   supplierName, supplierId, status, orderDate(ISO), deliveryDate("YYYY-MM-DD"|null),
//   note,
//   items(OrderItem[] — sửa tên/đvt/SL/đơn giá theo thứ tự, KT+admin đều được, tính lại total),
//   prices(number[] — legacy, chỉ đổi đơn giá) — dùng khi không gửi items.
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

  // Kế toán KHÔNG được sửa đơn đã nhận / đã thanh toán (đã ghi công nợ NCC).
  if (isKeToan && (order.status === "received" || order.status === "paid")) {
    return NextResponse.json(
      { message: "Đơn đã nhận — kế toán không được sửa. Liên hệ admin." },
      { status: 403 },
    );
  }

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

  // Sửa vật tư (tên/đvt/SL/đơn giá) — KT + admin đều được. Giữ it.key GỐC để neo dự toán.
  const orig = order.items as unknown as OrderItem[];
  if (Array.isArray(body.items)) {
    const items = (body.items as unknown[]).map((raw, i) => {
      const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const base = orig[i];
      const qty = Number(o.qty);
      const price = Math.round(Number(o.price));
      const name = String(o.name ?? base?.name ?? "").trim();
      const unit = String(o.unit ?? base?.unit ?? "").trim();
      return {
        key: String(o.key ?? base?.key ?? `${name}|${unit}`),
        name,
        unit,
        qty: Number.isFinite(qty) && qty > 0 ? qty : base?.qty ?? 0,
        price: Number.isFinite(price) && price >= 0 ? price : base?.price ?? 0,
      } as OrderItem;
    });
    data.items = items;
    data.total = items.reduce((s, it) => s + it.qty * it.price, 0);
  } else if (Array.isArray(body.prices)) {
    // legacy: chỉ đổi đơn giá theo index.
    const items = orig.map((it, i) => {
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
  const { isKeToan, error } = await requireMuaHang();
  if (error) return error;

  const order = await prisma.mhOrder.findFirst({
    where: { id: params.orderId, projectId: params.id },
    select: { id: true, status: true },
  });
  if (!order) return NextResponse.json({ message: "Không thấy đơn" }, { status: 404 });

  // Kế toán KHÔNG được xoá đơn đã nhận / đã thanh toán (đã ghi công nợ NCC).
  if (isKeToan && (order.status === "received" || order.status === "paid")) {
    return NextResponse.json(
      { message: "Đơn đã nhận — kế toán không được xoá. Liên hệ admin." },
      { status: 403 },
    );
  }

  await prisma.mhOrder.delete({ where: { id: order.id } });
  return NextResponse.json({ ok: true });
}
