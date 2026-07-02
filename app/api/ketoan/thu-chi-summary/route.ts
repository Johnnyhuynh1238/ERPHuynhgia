import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const ROLES_VIEW = new Set<string>([UserRole.admin, UserRole.accountant]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!ROLES_VIEW.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const [
    accounts,
    expensePending,
    receiptPending,
    paymentOrderApproved,
    proposalPending,
    proposalToOrder,
    receiptNeedsDebtRows,
    payableCount,
    paymentDueCount,
  ] = await Promise.all([
    prisma.cashAccount.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, kind: true, currentBalance: true },
    }),
    prisma.expense.count({ where: { status: "pending" } }),
    prisma.receipt.count({ where: { status: "pending" } }),
    prisma.supplierPaymentOrder.count({ where: { status: "approved" } }),
    prisma.materialProposal.count({ where: { status: "pending" } }),
    prisma.materialProposal.count({
      where: { status: "accepted", orderStatus: "not_ordered" },
    }),
    // Receipt (KS đã nhận) chưa có debt tương ứng (KT chưa ghi công nợ).
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM material_proposal_item_receipts r
      LEFT JOIN material_proposal_item_debts d
        ON d.proposal_id = r.proposal_id AND d.item_seq = r.item_seq
      WHERE d.id IS NULL
    `,
    // Công nợ NCC: debt chưa trả + KHÔNG nằm trong lệnh active (pending/approved/paid).
    prisma.materialProposalItemDebt.count({
      where: {
        paidAt: null,
        paymentOrderItems: {
          none: { order: { status: { in: ["pending", "approved", "paid"] } } },
        },
      },
    }),
    // Công nợ KH: PaymentSchedule chưa thu (loại collected/paid/cancelled).
    prisma.paymentSchedule.count({
      where: { status: { notIn: ["collected", "paid", "cancelled"] } },
    }),
  ]);
  const receiptNeedsDebt = Number(receiptNeedsDebtRows[0]?.count ?? 0);

  const accountsOut = accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    kind: a.kind,
    currentBalance: Number(a.currentBalance),
  }));
  const totalBalance = accountsOut.reduce((sum, a) => sum + a.currentBalance, 0);

  const processTotal = expensePending + receiptPending + paymentOrderApproved;

  return NextResponse.json({
    balance: {
      total: totalBalance,
      accounts: accountsOut,
    },
    counts: {
      create: 0,
      process: processTotal,
      journal: 0,
      congNo: payableCount + paymentDueCount,
    },
    processBreakdown: {
      expense: expensePending,
      receipt: receiptPending,
      paymentOrder: paymentOrderApproved,
    },
    congNoBreakdown: {
      payableNcc: payableCount,
      paymentDueKh: paymentDueCount,
    },
    todos: {
      proposalPending,
      proposalToOrder,
      receiptNeedsDebt,
      expensePending,
      receiptPending,
      paymentOrderApproved,
    },
  });
}
