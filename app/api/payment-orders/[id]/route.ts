import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const KT_ROLES = new Set<string>([UserRole.accountant, UserRole.admin]);

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!KT_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const order = await prisma.supplierPaymentOrder.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      code: true,
      status: true,
      totalAmount: true,
      paymentMethod: true,
      note: true,
      createdAt: true,
      approvedAt: true,
      approvalNote: true,
      rejectedAt: true,
      rejectionNote: true,
      paidAt: true,
      cancelledAt: true,
      supplier: {
        select: {
          id: true,
          code: true,
          name: true,
          phone: true,
          bankName: true,
          bankAccount: true,
          bankAccountName: true,
        },
      },
      account: { select: { id: true, code: true, name: true, kind: true } },
      creator: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
      rejecter: { select: { id: true, fullName: true } },
      payer: { select: { id: true, fullName: true } },
      items: {
        select: {
          id: true,
          amount: true,
          debt: {
            select: {
              id: true,
              proposalId: true,
              itemSeq: true,
              supplierItemCode: true,
              unitPrice: true,
              qty: true,
              note: true,
              proposal: {
                select: {
                  id: true,
                  parsedItems: true,
                  project: { select: { id: true, code: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!order) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const items = order.items.map((it) => {
    const parsed = Array.isArray(it.debt.proposal.parsedItems) ? it.debt.proposal.parsedItems : [];
    const p = parsed[it.debt.itemSeq] as { ten?: string; name?: string; dvt?: string; unit?: string } | undefined;
    return {
      id: it.id,
      amount: Number(it.amount),
      debtId: it.debt.id,
      proposalId: it.debt.proposalId,
      itemSeq: it.debt.itemSeq,
      materialName: (p?.name ?? p?.ten ?? "").trim() || "—",
      unit: (p?.unit ?? p?.dvt ?? "").trim(),
      supplierItemCode: it.debt.supplierItemCode,
      unitPrice: Number(it.debt.unitPrice),
      qty: Number(it.debt.qty),
      note: it.debt.note,
      project: it.debt.proposal.project,
    };
  });

  return NextResponse.json({
    order: {
      id: order.id,
      code: order.code,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      paymentMethod: order.paymentMethod,
      note: order.note,
      createdAt: order.createdAt.toISOString(),
      approvedAt: order.approvedAt?.toISOString() ?? null,
      approvalNote: order.approvalNote,
      rejectedAt: order.rejectedAt?.toISOString() ?? null,
      rejectionNote: order.rejectionNote,
      paidAt: order.paidAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      supplier: order.supplier,
      account: order.account,
      creator: order.creator,
      approver: order.approver,
      rejecter: order.rejecter,
      payer: order.payer,
      items,
    },
  });
}
