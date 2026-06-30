import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { recordCashTxn } from "@/lib/treasury";

export const runtime = "nodejs";

const KT_ROLES = new Set<string>([UserRole.accountant, UserRole.admin]);

const schema = z.object({
  accountId: z.string().uuid(),
  paymentMethod: z.enum(["cash", "transfer"]),
  paidAmount: z.number().positive().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!KT_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() }, { status: 400 });
  }

  const order = await prisma.supplierPaymentOrder.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      code: true,
      status: true,
      totalAmount: true,
      supplier: { select: { id: true, name: true } },
      items: { select: { debtId: true, amount: true } },
    },
  });
  if (!order) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (order.status !== "approved") {
    return NextResponse.json(
      { message: "Lệnh phải được admin duyệt trước khi chi" },
      { status: 400 },
    );
  }

  const orderTotal = new Prisma.Decimal(order.totalAmount);
  const paidAmount = parsed.data.paidAmount != null ? new Prisma.Decimal(parsed.data.paidAmount) : orderTotal;
  if (!paidAmount.eq(orderTotal)) {
    return NextResponse.json(
      { message: "Số tiền chi phải bằng đúng tổng lệnh" },
      { status: 400 },
    );
  }

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.supplierPaymentOrder.update({
        where: { id: order.id },
        data: {
          status: "paid",
          paymentMethod: parsed.data.paymentMethod,
          accountId: parsed.data.accountId,
          paidBy: user.id,
          paidAt: now,
        },
      });
      await tx.materialProposalItemDebt.updateMany({
        where: { id: { in: order.items.map((i) => i.debtId) } },
        data: { paidAt: now },
      });
      await recordCashTxn(tx, {
        direction: "out",
        amount: paidAmount,
        occurredAt: now,
        refType: "material_proposal",
        refId: null,
        accountId: parsed.data.accountId,
        projectId: null,
        categoryId: null,
        note:
          `Chi NCC ${order.supplier.name} theo lệnh ${order.code}` +
          (parsed.data.note ? ` — ${parsed.data.note}` : ""),
        createdBy: user.id,
      });
    });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || "Lỗi ghi chi" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
