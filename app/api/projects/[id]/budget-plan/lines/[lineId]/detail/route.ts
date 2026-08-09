import { NextResponse } from "next/server";
import { ExpenseStatus, MhOrderStatus, SubContractStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function canAccess(role: string | undefined) {
  return role === UserRole.admin || role === UserRole.accountant;
}

const MH_ACTIVE: MhOrderStatus[] = [
  MhOrderStatus.ordered,
  MhOrderStatus.received,
  MhOrderStatus.paid,
];
const num = (d: { toString(): string } | number | null | undefined) => (d == null ? 0 : Number(d));

// GET: danh sách chi phí (mua hàng + thầu phụ + chi tay) gắn 1 hạng mục,
//   hoặc chưa gắn (lineId = "unassigned"). Kèm list hạng mục để đổi.
export async function GET(
  _req: Request,
  { params }: { params: { id: string; lineId: string } },
) {
  const user = await getCurrentUser();
  if (!canAccess(user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const projectId = params.id;
  const lineFilter = params.lineId === "unassigned" ? null : params.lineId;

  const [orders, subs, expenses, lines] = await Promise.all([
    prisma.mhOrder.findMany({
      where: { projectId, status: { in: MH_ACTIVE }, budgetLineId: lineFilter },
      select: {
        id: true,
        seq: true,
        supplierName: true,
        total: true,
        status: true,
        orderDate: true,
        budgetLineId: true,
      },
      orderBy: { seq: "desc" },
    }),
    prisma.subContract.findMany({
      where: {
        projectId,
        status: { in: [SubContractStatus.active, SubContractStatus.completed] },
        budgetLineId: lineFilter,
      },
      select: { id: true, code: true, title: true, contractValue: true, status: true, budgetLineId: true },
    }),
    prisma.expense.findMany({
      where: {
        projectId,
        status: ExpenseStatus.paid,
        sourceType: { notIn: ["mua_hang_order", "ncc_congno"] },
        budgetLineId: lineFilter,
      },
      select: {
        id: true,
        amount: true,
        paidAmount: true,
        note: true,
        paidAt: true,
        createdAt: true,
        budgetLineId: true,
        category: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.projectBudgetPlanLine.findMany({
      where: { plan: { projectId } },
      select: { id: true, name: true, groupKind: true },
      orderBy: { sortRank: "asc" },
    }),
  ]);

  const items = [
    ...orders.map((o) => ({
      source: "mh_order" as const,
      id: o.id,
      label: `Đơn #${o.seq}${o.supplierName ? ` · ${o.supplierName}` : ""}`,
      sub: o.status === "paid" ? "Đã thanh toán" : o.supplierName ? "Công nợ NCC" : "Trả ngay",
      amount: num(o.total),
      date: o.orderDate ? o.orderDate.toISOString().slice(0, 10) : null,
      budgetLineId: o.budgetLineId,
    })),
    ...subs.map((s) => ({
      source: "sub" as const,
      id: s.id,
      label: `${s.code} · ${s.title}`,
      sub: s.status === SubContractStatus.completed ? "Thầu phụ · hoàn thành" : "Thầu phụ · đang làm",
      amount: num(s.contractValue),
      date: null as string | null,
      budgetLineId: s.budgetLineId,
    })),
    ...expenses.map((e) => ({
      source: "expense" as const,
      id: e.id,
      label: e.note?.trim() || e.category?.name || "Chi phí",
      sub: "Chi tay",
      amount: num(e.paidAmount ?? e.amount),
      date: (e.paidAt ?? e.createdAt)?.toISOString().slice(0, 10) ?? null,
      budgetLineId: e.budgetLineId,
    })),
  ];

  return NextResponse.json({ items, lines });
}
