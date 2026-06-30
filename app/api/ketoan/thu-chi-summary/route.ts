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

  const [accounts, expensePending, receiptPending, paymentOrderApproved] = await Promise.all([
    prisma.cashAccount.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, kind: true, currentBalance: true },
    }),
    prisma.expense.count({ where: { status: "pending" } }),
    prisma.receipt.count({ where: { status: "pending" } }),
    prisma.supplierPaymentOrder.count({ where: { status: "approved" } }),
  ]);

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
    },
    processBreakdown: {
      expense: expensePending,
      receipt: receiptPending,
      paymentOrder: paymentOrderApproved,
    },
  });
}
