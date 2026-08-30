import { ExpenseStatus, Prisma, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { fireAndForget, notifyExpenseCreated, notifyExpenseKtRequest } from "@/lib/notifications";
import { findBankByName } from "@/lib/vn-banks";
import { getSubContractPaidTotal } from "@/lib/sub-payment-utils";

export const runtime = "nodejs";

const schema = z.object({
  amount: z.coerce.number().positive("Số tiền chi phải > 0"),
  note: z.string().trim().max(2000).optional().nullable(),
});

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

// POST /api/sub-contracts/[id]/pay — CHI CHUNG cấp hợp đồng thầu phụ (mô hình như trả nợ NCC).
// Nhập số tiền → tạo 1 lệnh chi (pending) gắn hợp đồng qua sourceType='sub_contract'.
// Đợt theo HĐ là tham khảo; khi lệnh chi được duyệt + chi (mark-paid / bill Zalo) thì
// recomputeSubContractPayments đổ tổng đã trả cộng dồn vào các đợt (đủ đợt nào → paid).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    return NextResponse.json({ message: "Chỉ kế toán / admin được gửi lệnh chi" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const amount = Math.round(parsed.data.amount);

  const contract = await prisma.subContract.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      code: true,
      projectId: true,
      contractValue: true,
      subcontractor: {
        select: { name: true, phone: true, bankName: true, bankAccount: true, bankAccountName: true },
      },
    },
  });
  if (!contract) return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });

  const access = await canUserAccessSubContract(contract.id, { id: user.id, role: user.role });
  if (!access.canAccess) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  // Chặn tạo lệnh chi khi CÒN lệnh chi chờ xử lý cho HĐ này (tránh gửi trùng).
  const pendingExisting = await prisma.expense.findFirst({
    where: {
      sourceType: "sub_contract",
      sourceId: contract.id,
      status: { notIn: [ExpenseStatus.cancelled, ExpenseStatus.paid] },
    },
    select: { code: true },
  });
  if (pendingExisting) {
    return NextResponse.json(
      { message: `HĐ đang có lệnh chi ${pendingExisting.code} chờ xử lý — chi xong mới gửi tiếp` },
      { status: 409 },
    );
  }

  // Cảnh báo (không chặn) nếu tổng đã trả + lần này vượt giá trị HĐ.
  const paidSoFar = await getSubContractPaidTotal(prisma, contract.id);
  const contractValue = Number(contract.contractValue || 0);
  const willExceed = contractValue > 0 && paidSoFar + amount > contractValue + 1;

  const category =
    (await prisma.expenseCategory.findFirst({ where: { name: "Thầu phụ" }, select: { id: true } })) ??
    (await prisma.expenseCategory.findFirst({ where: { name: "Khác" }, select: { id: true } }));
  if (!category) {
    return NextResponse.json({ message: "Chưa có danh mục chi phù hợp (Thầu phụ / Khác)" }, { status: 400 });
  }

  const sub = contract.subcontractor;
  const payeeBank = findBankByName(sub.bankName);
  const code = await nextExpenseCode();
  const isKtCreated = user.role === UserRole.accountant;
  const note = `Thanh toán HĐ thầu phụ ${contract.code}${parsed.data.note?.trim() ? ` — ${parsed.data.note.trim()}` : ""}`;

  const expense = await prisma.expense.create({
    data: {
      code,
      projectId: contract.projectId,
      categoryId: category.id,
      amount: new Prisma.Decimal(amount),
      payee: sub.name,
      payeePhone: sub.phone || null,
      paymentMethod: "transfer",
      note,
      status: isKtCreated ? ExpenseStatus.tptc_pending : ExpenseStatus.pending,
      payeeBankBin: payeeBank?.bin || null,
      payeeAccountNumber: sub.bankAccount || null,
      payeeAccountName: sub.bankAccountName || sub.name,
      sourceType: "sub_contract",
      sourceId: contract.id,
      createdBy: user.id,
    },
    include: { category: { select: { name: true } } },
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
  } else {
    // Admin tạo lệnh chi thầu phụ thẳng (status pending) → bắn Zalo kế toán (VietQR + text)
    // ngay, đồng bộ với /api/expenses. Trước đây nhánh này không notify nên KT không nhận QR.
    fireAndForget(
      notifyExpenseCreated({
        expenseId: expense.id,
        code: expense.code,
        amount,
        categoryName: expense.category.name,
        payee: expense.payee,
        projectLabel: null,
        actorUserId: user.id,
        actorName: user.name || user.email || "Admin",
      }),
    );
  }

  return NextResponse.json({
    message: `Đã gửi lệnh chi ${expense.code}${willExceed ? " (lưu ý: vượt giá trị HĐ)" : ""}`,
    expense: { id: expense.id, code: expense.code, status: expense.status },
    willExceed,
  });
}
