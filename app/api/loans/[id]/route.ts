import { NextResponse } from "next/server";
import { ExpenseStatus, LoanStatus, ReceiptStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { summarizeLoan } from "@/lib/debts";

const VIEW_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!VIEW_ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const loan = await prisma.loan.findUnique({
    where: { id: params.id },
    include: {
      expenses: {
        where: { status: { not: ExpenseStatus.cancelled } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, code: true, amount: true, status: true, paidAt: true, createdAt: true, note: true,
          category: { select: { code: true, name: true } },
        },
      },
      receipts: {
        where: { status: { not: ReceiptStatus.cancelled } },
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, amount: true, status: true, receivedAt: true, createdAt: true, note: true },
      },
    },
  });
  if (!loan) return NextResponse.json({ message: "Không tìm thấy khoản vay" }, { status: 404 });

  return NextResponse.json({
    id: loan.id,
    code: loan.code,
    lender: loan.lender,
    interestRate: loan.interestRate != null ? Number(loan.interestRate) : null,
    disbursedAt: loan.disbursedAt,
    dueDate: loan.dueDate,
    status: loan.status,
    note: loan.note,
    createdAt: loan.createdAt,
    ...summarizeLoan(loan),
    receiptTxns: loan.receipts.map((r) => ({ ...r, amount: Number(r.amount), kind: "receipt" as const })),
    expenseTxns: loan.expenses.map((e) => ({
      ...e,
      amount: Number(e.amount),
      kind: e.category.code === "LAIVAY" ? ("interest" as const) : ("principal" as const),
    })),
  });
}

const patchSchema = z.object({
  status: z.enum(["active", "paid"]).optional(),
  lender: z.string().trim().min(1).max(255).optional(),
  interestRate: z.coerce.number().min(0).max(1000).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  // Đóng/mở khoản vay là quyết định tài chính → chỉ admin.
  if (user.role !== UserRole.admin) return NextResponse.json({ message: "Chỉ admin" }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const d = parsed.data;
  const loan = await prisma.loan.update({
    where: { id: params.id },
    data: {
      ...(d.status ? { status: d.status as LoanStatus, closedAt: d.status === "paid" ? new Date() : null } : {}),
      ...(d.lender !== undefined ? { lender: d.lender.trim() } : {}),
      ...(d.interestRate !== undefined
        ? { interestRate: d.interestRate == null ? null : (d.interestRate as unknown as number) }
        : {}),
      ...(d.dueDate !== undefined ? { dueDate: d.dueDate } : {}),
      ...(d.note !== undefined ? { note: d.note?.trim() || null } : {}),
    },
  });
  return NextResponse.json({ id: loan.id, status: loan.status });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) return NextResponse.json({ message: "Chỉ admin" }, { status: 403 });

  const [exp, rec] = await Promise.all([
    prisma.expense.count({ where: { loanId: params.id } }),
    prisma.receipt.count({ where: { loanId: params.id } }),
  ]);
  if (exp + rec > 0) {
    return NextResponse.json({ message: "Khoản vay đã có giao dịch, không thể xoá" }, { status: 409 });
  }
  await prisma.loan.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
