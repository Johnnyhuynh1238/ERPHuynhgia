import { ExpenseStatus, Prisma, SubPaymentStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { fireAndForget, notifyExpenseKtRequest } from "@/lib/notifications";

// Sinh mã lệnh chi CHI-YYYYMM-NNNN (đồng bộ /api/expenses).
async function nextExpenseCode() {
  const now = new Date();
  const yymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `CHI-${yymm}-`;
  const last = await prisma.expense.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNo = last ? Number(last.code.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(lastNo + 1).padStart(4, "0")}`;
}

// POST /api/sub-payments/[id]/expense — kế toán gửi lệnh chi cho 1 đợt thanh toán thầu phụ.
// Flow: tạo Expense (tptc_pending) gắn subPaymentId → admin duyệt → KT chi (trừ sổ quỹ)
// → mark-paid tự set đợt = paid. Đợt chuyển sang "requested" khi đã có lệnh chi.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    return NextResponse.json({ message: "Chỉ kế toán / admin được gửi lệnh chi" }, { status: 403 });
  }

  const payment = await prisma.subPayment.findUnique({
    where: { id: params.id },
    include: {
      subContract: {
        select: {
          id: true,
          code: true,
          projectId: true,
          subcontractor: {
            select: { name: true, phone: true, bankName: true, bankAccount: true, bankAccountName: true },
          },
        },
      },
    },
  });
  if (!payment) return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });

  const access = await canUserAccessSubContract(payment.subContract.id, { id: user.id, role: user.role });
  if (!access.canAccess) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  if (payment.status === SubPaymentStatus.paid) {
    return NextResponse.json({ message: "Đợt này đã chi xong" }, { status: 400 });
  }

  // Không cho gửi trùng khi đã có lệnh chi đang chờ (chưa huỷ).
  const existing = await prisma.expense.findFirst({
    where: { subPaymentId: payment.id, status: { not: ExpenseStatus.cancelled } },
    select: { id: true, code: true },
  });
  if (existing) {
    return NextResponse.json(
      { message: `Đợt này đã có lệnh chi ${existing.code} đang xử lý` },
      { status: 409 },
    );
  }

  const amount = Number(payment.expectedAmount || 0);
  if (amount <= 0) {
    return NextResponse.json({ message: "Đợt chưa có số tiền để gửi lệnh chi" }, { status: 400 });
  }

  // Danh mục "Thầu phụ" (fallback "Khác" nếu chưa khai báo).
  const category =
    (await prisma.expenseCategory.findFirst({ where: { name: "Thầu phụ" }, select: { id: true } })) ??
    (await prisma.expenseCategory.findFirst({ where: { name: "Khác" }, select: { id: true } }));
  if (!category) {
    return NextResponse.json({ message: "Chưa có danh mục chi phù hợp (Thầu phụ / Khác)" }, { status: 400 });
  }

  const sub = payment.subContract.subcontractor;
  const code = await nextExpenseCode();
  const isKtCreated = user.role === UserRole.accountant;
  const note = `Thanh toán HĐ thầu phụ ${payment.subContract.code} · Đợt ${payment.stage}${payment.description ? ` — ${payment.description}` : ""}`;

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        code,
        projectId: payment.subContract.projectId,
        categoryId: category.id,
        amount: new Prisma.Decimal(amount),
        payee: sub.name,
        payeePhone: sub.phone || null,
        paymentMethod: "transfer",
        note,
        status: isKtCreated ? ExpenseStatus.tptc_pending : ExpenseStatus.pending,
        payeeAccountNumber: sub.bankAccount || null,
        payeeAccountName: sub.bankAccountName || sub.name,
        subPaymentId: payment.id,
        createdBy: user.id,
      },
      include: { category: { select: { name: true } } },
    });
    // Đợt sang "requested" — đã gửi lệnh chi, chờ duyệt + chi.
    await tx.subPayment.update({
      where: { id: payment.id },
      data: { status: SubPaymentStatus.requested },
    });
    return created;
  });

  if (isKtCreated) {
    fireAndForget(
      notifyExpenseKtRequest({
        expenseId: expense.id,
        code: expense.code,
        amount,
        categoryName: expense.category.name,
        payee: expense.payee,
        projectLabel: null,
        actorUserId: user.id,
        actorName: user.name || user.email || "Kế toán",
      }),
    );
  }

  return NextResponse.json({
    message: `Đã gửi lệnh chi ${expense.code}`,
    expense: { id: expense.id, code: expense.code, status: expense.status },
  });
}
