import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { notifyPaymentOrderNew } from "@/lib/notify-payment-order";

export const runtime = "nodejs";

const KT_ROLES = new Set<string>([UserRole.accountant, UserRole.admin]);

const createSchema = z.object({
  supplierId: z.string().uuid(),
  debtIds: z.array(z.string().uuid()).min(1).max(100),
  paymentMethod: z.enum(["cash", "transfer"]).optional(),
  note: z.string().max(1000).optional(),
});

// PT-YYYYMMDD-### auto generated.
async function nextOrderCode(): Promise<string> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `PT-${yyyy}${mm}${dd}-`;
  const last = await prisma.supplierPaymentOrder.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNum = last?.code.split("-").pop() ?? "0";
  const next = String(Number(lastNum) + 1).padStart(3, "0");
  return `${prefix}${next}`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!KT_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status"); // pending|approved|paid|rejected|cancelled|all
  const scope = url.searchParams.get("scope"); // mine|all (default all for admin, mine for accountant)
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const where: Prisma.SupplierPaymentOrderWhereInput = {};
  if (statusParam && statusParam !== "all") {
    where.status = statusParam as Prisma.SupplierPaymentOrderWhereInput["status"];
  }
  if (scope === "mine" || (scope !== "all" && user.role === UserRole.accountant)) {
    where.createdBy = user.id;
  }

  const orders = await prisma.supplierPaymentOrder.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      code: true,
      status: true,
      totalAmount: true,
      paymentMethod: true,
      note: true,
      createdAt: true,
      approvedAt: true,
      rejectedAt: true,
      paidAt: true,
      cancelledAt: true,
      supplier: { select: { id: true, code: true, name: true } },
      creator: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
      rejecter: { select: { id: true, fullName: true } },
      payer: { select: { id: true, fullName: true } },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      totalAmount: Number(o.totalAmount),
      paymentMethod: o.paymentMethod,
      note: o.note,
      itemCount: o._count.items,
      supplier: o.supplier,
      creator: o.creator,
      approver: o.approver,
      rejecter: o.rejecter,
      payer: o.payer,
      createdAt: o.createdAt.toISOString(),
      approvedAt: o.approvedAt?.toISOString() ?? null,
      rejectedAt: o.rejectedAt?.toISOString() ?? null,
      paidAt: o.paidAt?.toISOString() ?? null,
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!KT_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() }, { status: 400 });
  }

  const debts = await prisma.materialProposalItemDebt.findMany({
    where: { id: { in: parsed.data.debtIds }, supplierId: parsed.data.supplierId, paidAt: null },
    select: {
      id: true,
      totalAmount: true,
      paymentOrderItems: {
        where: { order: { status: { in: ["pending", "approved", "paid"] } } },
        select: { id: true },
      },
    },
  });
  if (debts.length !== parsed.data.debtIds.length) {
    return NextResponse.json(
      { message: "Có công nợ không thuộc NCC này hoặc đã trả" },
      { status: 400 },
    );
  }
  const locked = debts.filter((d) => d.paymentOrderItems.length > 0);
  if (locked.length > 0) {
    return NextResponse.json(
      { message: `${locked.length} công nợ đã nằm trong lệnh khác. Tải lại trang.` },
      { status: 409 },
    );
  }

  const totalAmount = debts.reduce(
    (s, d) => s.add(new Prisma.Decimal(d.totalAmount)),
    new Prisma.Decimal(0),
  );
  const code = await nextOrderCode();

  const supplier = await prisma.supplier.findUnique({
    where: { id: parsed.data.supplierId },
    select: { id: true, name: true },
  });
  if (!supplier) {
    return NextResponse.json({ message: "NCC không tồn tại" }, { status: 404 });
  }

  const order = await prisma.supplierPaymentOrder.create({
    data: {
      code,
      supplierId: parsed.data.supplierId,
      totalAmount,
      paymentMethod: parsed.data.paymentMethod ?? null,
      note: parsed.data.note?.trim() || null,
      createdBy: user.id,
      items: {
        create: debts.map((d) => ({
          debtId: d.id,
          amount: new Prisma.Decimal(d.totalAmount),
        })),
      },
    },
    select: { id: true, code: true },
  });

  // Push admin async.
  void notifyPaymentOrderNew({
    orderId: order.id,
    code: order.code,
    supplierName: supplier.name,
    totalAmount: Number(totalAmount),
    actorUserId: user.id,
    actorName: user.name ?? "KT",
  });

  return NextResponse.json({ ok: true, orderId: order.id, code: order.code }, { status: 201 });
}
