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

  // Đầu ngày hôm nay theo giờ VN (server có thể chạy UTC)
  const vnDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const startOfTodayVn = new Date(`${vnDateStr}T00:00:00+07:00`);

  const [accounts, expensePending, receiptPending, todayFlowRows] = await Promise.all([
    prisma.cashAccount.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, kind: true, currentBalance: true },
    }),
    prisma.expense.count({ where: { status: "pending" } }),
    prisma.receipt.count({ where: { status: "pending" } }),
    // Dòng tiền hôm nay (giờ VN) — bỏ chuyển nội bộ giữa 2 quỹ (không đổi tổng số dư).
    prisma.cashTransaction.groupBy({
      by: ["direction"],
      where: { occurredAt: { gte: startOfTodayVn }, counterAccountId: null },
      _sum: { amount: true },
    }),
  ]);
  const todayIn = Number(todayFlowRows.find((r) => r.direction === "in")?._sum.amount ?? 0);
  const todayOut = Number(todayFlowRows.find((r) => r.direction === "out")?._sum.amount ?? 0);
  // Công nợ KH "ping": lệnh thu do admin tạo — pending (KT chưa nhận). Dùng lại count đã có.
  const kkhReceiptActive = receiptPending;

  const accountsOut = accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    kind: a.kind,
    currentBalance: Number(a.currentBalance),
  }));
  const totalBalance = accountsOut.reduce((sum, a) => sum + a.currentBalance, 0);

  const processTotal = expensePending + receiptPending;
  // Công nợ badge = ping do admin tạo lệnh thu (KT chưa nhận). Công nợ NCC nay theo dự án.
  const congNoPing = kkhReceiptActive;

  return NextResponse.json({
    balance: {
      total: totalBalance,
      accounts: accountsOut,
    },
    todayFlow: {
      in: todayIn,
      out: todayOut,
      net: todayIn - todayOut,
    },
    counts: {
      create: 0,
      process: processTotal,
      journal: 0,
      congNo: congNoPing,
      donHang: 0,
    },
    processBreakdown: {
      expense: expensePending,
      receipt: receiptPending,
    },
    congNoBreakdown: {
      paymentDueKhActive: kkhReceiptActive,
    },
    todos: {
      expensePending,
      receiptPending,
    },
  });
}
