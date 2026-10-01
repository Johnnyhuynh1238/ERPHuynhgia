import { NextResponse } from "next/server";
import { Prisma, ReceiptSource, ReceiptStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMuaHang } from "@/lib/estimate";
import { fireAndForget, notifyReceiptCreated } from "@/lib/notifications";

export const runtime = "nodejs";

// Sinh mã lệnh thu THU-YYYYMM-####
async function nextReceiptCode() {
  const now = new Date();
  const yymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `THU-${yymm}-`;
  const last = await prisma.receipt.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNo = last ? Number(last.code.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(lastNo + 1).padStart(4, "0")}`;
}

// POST: lập lệnh thu "NCC hoàn tiền" cho một ĐƠN TRẢ hàng (refund).
//  Đơn trả refund = mh_orders total < 0, status 'paid', returnOfOrderId != null.
//  Tạo Receipt supplier_refund (pending, điền sẵn số tiền + NCC) gắn qua mhOrderId.
//  KT thu trên màn Lệnh thu → tiền vào quỹ. Chặn tạo trùng.
//  CHỈ admin (kế toán 403).
export async function POST(
  _req: Request,
  { params }: { params: { id: string; orderId: string } },
) {
  const { user, isKeToan, error } = await requireMuaHang();
  if (error) return error;
  if (isKeToan) {
    return NextResponse.json(
      { message: "Lệnh thu hoàn tiền do admin lập. Liên hệ admin." },
      { status: 403 },
    );
  }

  const order = await prisma.mhOrder.findFirst({
    where: { id: params.orderId, projectId: params.id },
  });
  if (!order) return NextResponse.json({ message: "Không thấy đơn trả" }, { status: 404 });
  if (!order.returnOfOrderId || Number(order.total) >= 0) {
    return NextResponse.json(
      { message: "Chỉ lập lệnh thu cho đơn TRẢ hàng (giá trị âm)." },
      { status: 400 },
    );
  }
  if (order.status !== "paid") {
    return NextResponse.json(
      { message: "Lệnh thu chỉ cho đơn trả kiểu 'NCC hoàn tiền'. Đơn cấn công nợ không thu tiền." },
      { status: 400 },
    );
  }

  // Chặn trùng: đã có lệnh thu (chưa huỷ) gắn đơn này.
  const existing = await prisma.receipt.findFirst({
    where: { mhOrderId: order.id, status: { not: "cancelled" } },
    select: { code: true },
  });
  if (existing) {
    return NextResponse.json(
      { message: `Đơn này đã có lệnh thu ${existing.code}.` },
      { status: 409 },
    );
  }

  const refundAmount = Math.abs(Number(order.total));
  const code = await nextReceiptCode();
  const receipt = await prisma.receipt.create({
    data: {
      code,
      source: ReceiptSource.supplier_refund,
      projectId: params.id,
      amount: new Prisma.Decimal(refundAmount),
      payer: order.supplierName || "Nhà cung cấp",
      note: `Hoàn tiền trả hàng (đơn trả #${order.seq})`,
      status: ReceiptStatus.pending, // admin lập → chờ KT thu
      mhOrderId: order.id,
      createdBy: user!.id,
    },
    select: { id: true, code: true, amount: true },
  });

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { code: true, name: true },
  });
  fireAndForget(
    notifyReceiptCreated({
      receiptId: receipt.id,
      code: receipt.code,
      amount: Number(receipt.amount),
      source: ReceiptSource.supplier_refund,
      payer: order.supplierName || null,
      projectLabel: project ? `${project.code} — ${project.name}` : null,
      actorUserId: user!.id,
      actorName: user!.name || user!.email || "Admin",
    }),
  );

  return NextResponse.json({ ok: true, receiptCode: receipt.code });
}
