import { NextResponse } from "next/server";
import { ExpenseStatus, Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function canView(role: string) {
  return role === UserRole.construction_manager || role === UserRole.admin;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canView(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "tptc_pending";

  const where: Prisma.ExpenseWhereInput = {
    category: { code: "MUA-LE" },
  };
  if (status === "all") {
    where.status = { in: [ExpenseStatus.tptc_pending, ExpenseStatus.pending, ExpenseStatus.paid, ExpenseStatus.cancelled] };
  } else if (status === "tptc_pending") {
    where.status = ExpenseStatus.tptc_pending;
  } else if (status === "history") {
    where.status = { in: [ExpenseStatus.pending, ExpenseStatus.paid, ExpenseStatus.cancelled] };
    where.tptcApprovedAt = { not: null };
  }

  const rows = await prisma.expense.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      project: { select: { id: true, code: true, name: true } },
      category: { select: { id: true, code: true, name: true } },
      creator: { select: { id: true, fullName: true } },
      tptcApprover: { select: { id: true, fullName: true } },
      payer: { select: { id: true, fullName: true } },
    },
    take: 200,
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      paidAmount: r.paidAmount != null ? Number(r.paidAmount) : null,
    })),
  });
}
