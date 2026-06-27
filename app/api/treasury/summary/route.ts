import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const ROLES_VIEW = new Set<string>([UserRole.admin, UserRole.accountant]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ROLES_VIEW.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const [cash, accounts, pending] = await Promise.all([
    prisma.companyCash.findFirst({
      include: { openingSetter: { select: { id: true, fullName: true } } },
    }),
    prisma.cashAccount.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, kind: true, currentBalance: true },
    }),
    prisma.expense.aggregate({
      where: { status: "pending" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const accountsOut = accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    kind: a.kind,
    currentBalance: Number(a.currentBalance),
  }));
  const totalFromAccounts = accountsOut.reduce((sum, a) => sum + a.currentBalance, 0);

  if (!cash) {
    return NextResponse.json({
      initialized: false,
      currentBalance: totalFromAccounts,
      openingBalance: 0,
      openingDate: null,
      openingNote: null,
      lastTxnAt: null,
      openingSetBy: null,
      openingSetAt: null,
      pendingExpenseTotal: 0,
      pendingExpenseCount: 0,
      accounts: accountsOut,
    });
  }

  return NextResponse.json({
    initialized: cash.initialized,
    currentBalance: totalFromAccounts,
    openingBalance: Number(cash.openingBalance),
    openingDate: cash.openingDate,
    openingNote: cash.openingNote,
    openingSetAt: cash.openingSetAt,
    openingSetBy: cash.openingSetter ? { id: cash.openingSetter.id, fullName: cash.openingSetter.fullName } : null,
    lastTxnAt: cash.lastTxnAt,
    pendingExpenseTotal: Number(pending._sum.amount ?? 0),
    pendingExpenseCount: pending._count._all,
    accounts: accountsOut,
  });
}
