import { NextResponse } from "next/server";
import { Prisma, ReceiptSource, ReceiptStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMuaHang } from "@/lib/estimate";
import { fireAndForget, notifyReceiptCreated } from "@/lib/notifications";

export const runtime = "nodejs";

type OrderItem = { key: string; name: string; unit: string; qty: number; price: number };

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

// POST: trả hàng đơn mua gốc → tạo đơn mh_orders giá trị ÂM.
//  cashMode 'offset'  → status 'received' → view công nợ tự trừ (không sinh tiền).
//  cashMode 'refund'  → status 'paid' (ngoài view công nợ) + lệnh thu 'supplier_refund'
//                       (NCC hoàn tiền, chờ KT thu → tiền vào quỹ).
// Body { items:[{key, qty}], cashMode, note? }. qty = SL trả (dương), lưu xuống âm.
// CHỈ admin (không cho kế toán).
export async function POST(
  req: Request,
  { params }: { params: { id: string; orderId: string } },
) {
  const { user, isKeToan, error } = await requireMuaHang();
  if (error) return error;
  if (isKeToan) {
    return NextResponse.json(
      { message: "Trả hàng do admin thực hiện (ảnh hưởng công nợ / lệnh thu). Liên hệ admin." },
      { status: 403 },
    );
  }

  const src = await prisma.mhOrder.findFirst({
    where: { id: params.orderId, projectId: params.id },
  });
  if (!src) return NextResponse.json({ message: "Không thấy đơn gốc" }, { status: 404 });
  if (src.returnOfOrderId) {
    return NextResponse.json({ message: "Đây là đơn trả hàng — không trả tiếp." }, { status: 400 });
  }
  if (src.status !== "received" && src.status !== "paid") {
    return NextResponse.json(
      { message: "Chỉ trả được hàng của đơn đã nhận / đã thanh toán." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    items?: Array<{ key?: string; qty?: number }>;
    cashMode?: string;
    note?: string;
  };
  const cashMode = body.cashMode === "refund" ? "refund" : "offset";

  const srcItems = (src.items as unknown as OrderItem[]) || [];
  const srcByKey = new Map<string, OrderItem>();
  for (const it of srcItems) srcByKey.set(it.key, it);

  // Đã trả trước đó (các đơn trả trỏ về đơn gốc này) — cộng dồn theo key (qty đang âm).
  const priorReturns = await prisma.mhOrder.findMany({
    where: { projectId: params.id, returnOfOrderId: src.id },
    select: { items: true },
  });
  const returnedByKey: Record<string, number> = {};
  for (const r of priorReturns) {
    for (const it of (r.items as unknown as OrderItem[]) || []) {
      returnedByKey[it.key] = (returnedByKey[it.key] || 0) + Math.abs(Number(it.qty) || 0);
    }
  }

  // Dựng dòng trả (qty âm), chặn vượt SL còn có thể trả.
  const retItems: OrderItem[] = [];
  for (const raw of body.items || []) {
    const key = String(raw?.key || "");
    const qty = Number(raw?.qty) || 0;
    if (!key || qty <= 0) continue;
    const orig = srcByKey.get(key);
    if (!orig) {
      return NextResponse.json({ message: `Vật tư không thuộc đơn gốc: ${key}` }, { status: 400 });
    }
    const available = Number(orig.qty) - (returnedByKey[key] || 0);
    if (qty > available + 1e-6) {
      return NextResponse.json(
        {
          message: `Trả vượt: ${orig.name} chỉ còn ${Math.max(available, 0)} ${orig.unit} có thể trả (đã mua ${orig.qty}, đã trả ${returnedByKey[key] || 0}).`,
        },
        { status: 400 },
      );
    }
    retItems.push({ key, name: orig.name, unit: orig.unit, qty: -qty, price: orig.price });
  }

  if (!retItems.length) {
    return NextResponse.json({ message: "Chọn ít nhất 1 vật tư và SL trả > 0." }, { status: 400 });
  }

  const total = retItems.reduce((s, it) => s + it.qty * it.price, 0); // âm
  const refundAmount = Math.abs(total);
  const note =
    `Trả hàng đơn #${src.seq}` +
    (cashMode === "refund" ? " · NCC hoàn tiền" : " · cấn công nợ") +
    (body.note?.trim() ? ` — ${body.note.trim()}` : "");

  let receiptCode: string | null = null;
  let createdSeq = 0;
  let receiptForNotify: { id: string; code: string; amount: number } | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const last = await tx.mhOrder.findFirst({
        where: { projectId: params.id },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      const seq = (last?.seq || 0) + 1;
      createdSeq = seq;

      // offset → 'received' để đơn âm trừ CÔNG NỢ (view nợ chỉ tính received + supplier).
      // refund → 'paid' (loại khỏi view công nợ): tiền về qua lệnh thu, không tạo nợ âm ảo.
      const retOrder = await tx.mhOrder.create({
        data: {
          projectId: params.id,
          seq,
          status: cashMode === "refund" ? "paid" : "received",
          supplierId: src.supplierId,
          supplierName: src.supplierName,
          orderDate: new Date(),
          note,
          total,
          items: retItems as unknown as Prisma.InputJsonValue,
          budgetLineId: src.budgetLineId, // giữ lineage hạng mục của đơn gốc
          returnOfOrderId: src.id,
          createdBy: user!.id,
        },
      });

      if (cashMode === "refund") {
        const code = await nextReceiptCode();
        receiptCode = code;
        const receipt = await tx.receipt.create({
          data: {
            code,
            source: ReceiptSource.supplier_refund,
            projectId: params.id,
            amount: new Prisma.Decimal(refundAmount),
            payer: src.supplierName || "Nhà cung cấp",
            note: `Hoàn tiền trả hàng đơn #${src.seq} (đơn trả #${retOrder.seq})`,
            status: ReceiptStatus.pending, // admin tạo → chờ KT thu
            createdBy: user!.id,
          },
          select: { id: true, code: true, amount: true },
        });
        receiptForNotify = { id: receipt.id, code: receipt.code, amount: Number(receipt.amount) };
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi tạo đơn trả hàng";
    return NextResponse.json({ message: msg }, { status: 400 });
  }

  if (receiptForNotify) {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { code: true, name: true },
    });
    const r = receiptForNotify as { id: string; code: string; amount: number };
    fireAndForget(
      notifyReceiptCreated({
        receiptId: r.id,
        code: r.code,
        amount: r.amount,
        source: ReceiptSource.supplier_refund,
        payer: src.supplierName || null,
        projectLabel: project ? `${project.code} — ${project.name}` : null,
        actorUserId: user!.id,
        actorName: user!.name || user!.email || "Admin",
      }),
    );
  }

  return NextResponse.json({ ok: true, seq: createdSeq, receiptCode, cashMode });
}
