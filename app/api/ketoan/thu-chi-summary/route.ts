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

  const [
    accounts,
    expensePending,
    receiptPending,
    paymentOrderApproved,
    proposalPending,
    proposalToOrder,
    receiptNeedsDebtRows,
    proposalPaid,
    supplierOrderActive,
    todayFlowRows,
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
    // Đơn hàng đã thanh toán (KT đã trả NCC xong).
    prisma.materialProposal.count({ where: { orderStatus: "paid" } }),
    // Công nợ NCC "ping": lệnh TT NCC do KT/Admin khởi động — pending (chờ duyệt) + approved (chờ chi).
    prisma.supplierPaymentOrder.count({
      where: { status: { in: ["pending", "approved"] } },
    }),
    // Dòng tiền hôm nay (giờ VN) — bỏ chuyển nội bộ giữa 2 quỹ (không đổi tổng số dư).
    prisma.cashTransaction.groupBy({
      by: ["direction"],
      where: { occurredAt: { gte: startOfTodayVn }, counterAccountId: null },
      _sum: { amount: true },
    }),
  ]);
  const todayIn = Number(todayFlowRows.find((r) => r.direction === "in")?._sum.amount ?? 0);
  const todayOut = Number(todayFlowRows.find((r) => r.direction === "out")?._sum.amount ?? 0);
  const receiptNeedsDebt = Number(receiptNeedsDebtRows[0]?.count ?? 0);
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

  const processTotal = expensePending + receiptPending + paymentOrderApproved;
  const donHangPing = proposalPending + proposalToOrder + receiptNeedsDebt;
  // Công nợ badge = ping do admin/KT khởi động lệnh (NCC active + lệnh thu chờ nhận).
  const congNoPing = supplierOrderActive + kkhReceiptActive;

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
      donHang: donHangPing,
    },
    processBreakdown: {
      expense: expensePending,
      receipt: receiptPending,
      paymentOrder: paymentOrderApproved,
    },
    congNoBreakdown: {
      // Lệnh do admin/KT vừa tạo — cần KT xử lý ngay.
      payableNccActive: supplierOrderActive,
      paymentDueKhActive: kkhReceiptActive,
    },
    donHangBreakdown: {
      proposalPending,
      proposalToOrder,
      receiptNeedsDebt,
      proposalPaid,
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
