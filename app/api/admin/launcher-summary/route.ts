import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getWorkDateVn } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const now = new Date();
  const today = getWorkDateVn(now);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const in7 = new Date(today.getTime() + 7 * DAY_MS);

  const [
    cashAccounts,
    receivedThisMonth,
    activeProjects,
    leadsNew,
    expensePending,
    receiptAwaitingApproval,
    paymentDue7d,
    inboxOpen,
  ] = await Promise.all([
    prisma.cashAccount.findMany({
      where: { active: true },
      select: { currentBalance: true },
    }),
    prisma.receipt.aggregate({
      where: {
        source: "customer",
        status: "received",
        receivedAt: { gte: monthStart },
      },
      _sum: { receivedAmount: true },
    }),
    prisma.project.count({ where: { status: "in_progress" } }),
    prisma.baogiaLead.count({
      where: { status: "new", contactedAt: null },
    }),
    prisma.expense.count({ where: { status: "pending" } }),
    prisma.receipt.count({ where: { status: "awaiting_approval" } }),
    prisma.paymentSchedule.count({
      where: {
        dueDate: { not: null, lte: in7 },
        status: { notIn: ["collected", "paid", "cancelled"] },
      },
    }),
    prisma.inboxItem.count({ where: { status: "open" } }),
  ]);

  const cashBalance = cashAccounts.reduce(
    (sum, a) => sum + Number(a.currentBalance),
    0,
  );
  const revenueMonth = Number(receivedThisMonth._sum.receivedAmount ?? 0);

  return NextResponse.json({
    headline: {
      revenueMonth,
      activeProjects,
      cashBalance,
    },
    todos: {
      leadsNew,
      expensePending,
      receiptAwaitingApproval,
      paymentDue7d,
      inboxOpen,
    },
  });
}
