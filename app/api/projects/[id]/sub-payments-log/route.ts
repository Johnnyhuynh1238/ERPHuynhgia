import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canUserAccessProjectSubContracts, requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { canViewSubContractFinancial } from "@/lib/sub-contract-utils";

export const runtime = "nodejs";

// GET /api/projects/[id]/sub-payments-log — SỔ LỆNH CHI THẦU PHỤ của dự án.
// Nguồn thật khớp sổ quỹ: expenses gắn hợp đồng (source_type='sub_contract'), bỏ lệnh huỷ.
// Mỗi dòng = 1 lệnh chi (ngày, mã, thầu phụ, HĐ, số tiền, đã chi/chờ chi).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  const access = await canUserAccessProjectSubContracts(params.id, { id: user.id, role: user.role });
  if (!access) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  if (!canViewSubContractFinancial(user.role)) {
    return NextResponse.json({ message: "Không có quyền xem số tiền" }, { status: 403 });
  }

  const expenses = await prisma.expense.findMany({
    where: {
      projectId: params.id,
      sourceType: "sub_contract",
      status: { not: "cancelled" },
    },
    select: {
      id: true,
      code: true,
      sourceId: true,
      amount: true,
      paidAmount: true,
      status: true,
      paidAt: true,
      createdAt: true,
      payee: true,
      note: true,
    },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });

  const contractIds = Array.from(
    new Set(expenses.map((e) => e.sourceId).filter((x): x is string => Boolean(x))),
  );
  const contracts = contractIds.length
    ? await prisma.subContract.findMany({
        where: { id: { in: contractIds } },
        select: { id: true, code: true, title: true, subcontractor: { select: { name: true } } },
      })
    : [];
  const contractById = new Map(contracts.map((c) => [c.id, c]));

  const rows = expenses.map((e) => {
    const c = e.sourceId ? contractById.get(e.sourceId) : null;
    const isPaid = e.status === "paid";
    return {
      id: e.id,
      code: e.code,
      contractId: e.sourceId,
      contractCode: c?.code ?? null,
      contractTitle: c?.title ?? null,
      subcontractorName: c?.subcontractor.name ?? e.payee ?? "—",
      amount: Number(isPaid ? (e.paidAmount ?? e.amount) : e.amount),
      status: e.status,
      date: isPaid ? e.paidAt : e.createdAt,
      note: e.note,
    };
  });

  const paidTotal = rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const pendingTotal = rows.filter((r) => r.status !== "paid").reduce((s, r) => s + r.amount, 0);

  return NextResponse.json({
    rows,
    totals: { paidTotal, pendingTotal, count: rows.length },
  });
}
