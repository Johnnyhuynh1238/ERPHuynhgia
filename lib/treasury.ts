import { Prisma } from "@prisma/client";
import type { CashTxnDirection, CashTxnRefType } from "@prisma/client";

export type CashTxnInput = {
  direction: CashTxnDirection;
  amount: Prisma.Decimal | number | string;
  occurredAt: Date;
  refType: CashTxnRefType;
  refId?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  note?: string | null;
  createdBy: string;
};

/**
 * Ghi 1 dòng nhật ký quỹ + cập nhật số dư cty trong cùng transaction.
 * Phải gọi BÊN TRONG prisma.$transaction(async (tx) => { ... }) để đảm bảo atomic.
 * Khóa hàng company_cash bằng SELECT ... FOR UPDATE để tránh race khi nhiều thao tác chạy song song.
 */
export async function recordCashTxn(tx: Prisma.TransactionClient, input: CashTxnInput) {
  const amount = new Prisma.Decimal(input.amount);
  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error("Số tiền giao dịch phải lớn hơn 0");
  }

  const locked = await tx.$queryRaw<Array<{ id: string; current_balance: string; initialized: boolean }>>`
    SELECT id, current_balance, initialized FROM company_cash LIMIT 1 FOR UPDATE
  `;
  const row = locked[0];
  if (!row) {
    throw new Error("Sổ quỹ chưa khởi tạo — admin cần nhập số dư đầu kỳ trước");
  }
  if (!row.initialized) {
    throw new Error("Sổ quỹ chưa khởi tạo — admin cần nhập số dư đầu kỳ trước");
  }

  const current = new Prisma.Decimal(row.current_balance);
  const balanceAfter = input.direction === "in" ? current.add(amount) : current.sub(amount);

  await tx.companyCash.update({
    where: { id: row.id },
    data: {
      currentBalance: balanceAfter,
      lastTxnAt: new Date(),
    },
  });

  const txn = await tx.cashTransaction.create({
    data: {
      direction: input.direction,
      amount,
      occurredAt: input.occurredAt,
      balanceAfter,
      refType: input.refType,
      refId: input.refId ?? null,
      projectId: input.projectId ?? null,
      categoryId: input.categoryId ?? null,
      note: input.note?.trim() || null,
      createdBy: input.createdBy,
    },
  });

  return { txn, balanceAfter };
}

