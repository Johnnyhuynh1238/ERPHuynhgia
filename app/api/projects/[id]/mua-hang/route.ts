import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMuaHang } from "@/lib/estimate";

export const runtime = "nodejs";

// 1 dòng vật tư trong đơn (snapshot từ dự toán khi tạo — SL khoá).
type OrderItem = { key: string; name: string; unit: string; qty: number; price: number };

// Tên gốc VT (bỏ phần " (quy cách…)") — khớp cách gộp ở màn mua hàng.
const baseName = (n: string) => {
  const i = n.indexOf(" (");
  return (i >= 0 ? n.slice(0, i) : n).trim();
};
const matKey = (name: string, unit: string) => `${baseName(name)}|${unit.trim()}`;

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
  const { error } = await requireMuaHang();
  if (error) return error;

  const orders = await prisma.mhOrder.findMany({
    where: { projectId: params.id },
    orderBy: { seq: "desc" },
  });

  // Đơn nào đã có lệnh chi đang chờ (KT gửi/ chờ admin duyệt) -> khoá nút "Gửi lệnh chi"
  // tránh gửi trùng. Lệnh bị từ chối/huỷ = cancelled nên không khoá (cho gửi lại).
  const inflight = orders.length
    ? await prisma.expense.findMany({
        where: {
          sourceType: "mua_hang_order",
          sourceId: { in: orders.map((o) => o.id) },
          status: { in: ["tptc_pending", "pending"] },
        },
        select: { sourceId: true },
      })
    : [];
  const inflightSet = new Set(inflight.map((e) => e.sourceId));

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
      receiptImages: o.receiptImages,
      receivedAt: o.receivedAt,
      hasInflightExpense: inflightSet.has(o.id),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    })),
  });
}

// POST: tạo đơn mới. Body { items:[{key,name,unit,qty,price}], supplierName?, note? }.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, isKeToan, error } = await requireMuaHang();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    items?: unknown;
    supplierName?: string;
    supplierId?: string | null;
    note?: string;
  };
  const items = cleanItems(body.items);
  if (!items.length) {
    return NextResponse.json({ message: "Đơn phải có ít nhất 1 vật tư (SL > 0)" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ message: "Không thấy dự án" }, { status: 404 });

  // ── Kế toán: 1 tường SL theo dự toán (giá KT tự ghi). Admin bỏ qua (tự do). ──
  if (isKeToan) {
    // Trần SL gộp theo vật tư (mọi giai đoạn) từ dự toán.
    const mats = await prisma.estimateDbMaterial.findMany({
      where: { projectId: params.id },
      select: { name: true, unit: true, quantity: true },
    });
    const budgetQty: Record<string, number> = {}; // Σ SL dự toán / VT
    for (const m of mats) {
      const k = matKey(m.name, m.unit);
      budgetQty[k] = (budgetQty[k] || 0) + Number(m.quantity);
    }

    // Đã đặt cộng dồn (mọi đơn hiện có) theo VT.
    const existing = await prisma.mhOrder.findMany({
      where: { projectId: params.id },
      select: { items: true },
    });
    const placed: Record<string, number> = {};
    for (const o of existing) {
      for (const it of o.items as unknown as OrderItem[]) {
        const k = matKey(it.name, it.unit);
        placed[k] = (placed[k] || 0) + Number(it.qty || 0);
      }
    }

    // Gộp SL đơn mới theo VT (nhiều dòng cùng VT).
    const newQty: Record<string, number> = {};
    for (const it of items) {
      const k = matKey(it.name, it.unit);
      newQty[k] = (newQty[k] || 0) + it.qty;
    }

    // Soi từng VT → gom vi phạm SL vượt dự toán (giá không còn chặn — KT tự ghi).
    type Block = { materialName: string; unit: string; need: number; have: number; budget: number };
    const blocks: Block[] = [];
    for (const k of Object.keys(newQty)) {
      const [name, unit] = k.split("|");
      const budget = budgetQty[k];
      const need = newQty[k];
      if (budget == null) {
        blocks.push({ materialName: name, unit, need, have: 0, budget: 0 });
        continue;
      }
      const remain = budget - (placed[k] || 0);
      if (need > remain + 1e-6) {
        blocks.push({ materialName: name, unit, need, have: Math.max(remain, 0), budget });
      }
    }

    // Cho phép KT đặt VƯỢT dự toán (không chặn nữa) — chỉ GHI LOG để admin thấy đơn nào vượt.
    if (blocks.length) {
      await prisma.mhOrderBlock.createMany({
        data: blocks.map((b) => ({
          projectId: params.id,
          userId: user!.id,
          kind: "over_budget",
          materialName: b.materialName,
          unit: b.unit,
          need: b.need,
          have: b.have,
          budget: b.budget,
        })),
      });
    }
    // Giá do KT tự ghi (client gửi). SL vượt dự toán vẫn cho qua (đã log ở trên).
  }

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
      supplierId: body.supplierId ? String(body.supplierId) : null,
      note: body.note?.trim() || null,
      total: money(items),
      items,
      createdBy: user!.id,
    },
  });

  // Đặt hàng xong → dọn giỏ server của người dùng.
  await prisma.mhCartItem.deleteMany({ where: { projectId: params.id, userId: user!.id } });

  return NextResponse.json({ id: order.id, seq: order.seq });
}
