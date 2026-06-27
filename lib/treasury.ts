import { Prisma } from "@prisma/client";
import type { CashTxnDirection, CashTxnRefType } from "@prisma/client";

export type CashTxnInput = {
  direction: CashTxnDirection;
  amount: Prisma.Decimal | number | string;
  occurredAt: Date;
  refType: CashTxnRefType;
  refId?: string | null;
  accountId: string;
  counterAccountId?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  note?: string | null;
  createdBy: string;
};

/**
 * Ghi 1 dòng nhật ký quỹ + cập nhật số dư tài khoản trong cùng transaction.
 * Phải gọi BÊN TRONG prisma.$transaction(async (tx) => { ... }) để đảm bảo atomic.
 * Khóa hàng cash_accounts của accountId bằng SELECT ... FOR UPDATE để tránh race.
 * Sau khi update, sync company_cash.current_balance = SUM(cash_accounts.current_balance WHERE active).
 */
export async function recordCashTxn(tx: Prisma.TransactionClient, input: CashTxnInput) {
  const amount = new Prisma.Decimal(input.amount);
  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error("Số tiền giao dịch phải lớn hơn 0");
  }
  if (!input.accountId) {
    throw new Error("Thiếu tài khoản quỹ");
  }

  const locked = await tx.$queryRaw<Array<{ id: string; current_balance: string; active: boolean }>>`
    SELECT id, current_balance, active FROM cash_accounts WHERE id = ${input.accountId}::uuid FOR UPDATE
  `;
  const row = locked[0];
  if (!row) {
    throw new Error("Tài khoản quỹ không tồn tại");
  }
  if (!row.active) {
    throw new Error("Tài khoản quỹ đã ngừng hoạt động");
  }

  const current = new Prisma.Decimal(row.current_balance);
  const balanceAfter = input.direction === "in" ? current.add(amount) : current.sub(amount);

  await tx.cashAccount.update({
    where: { id: row.id },
    data: { currentBalance: balanceAfter, updatedAt: new Date() },
  });

  const txn = await tx.cashTransaction.create({
    data: {
      direction: input.direction,
      amount,
      occurredAt: input.occurredAt,
      balanceAfter,
      refType: input.refType,
      refId: input.refId ?? null,
      accountId: input.accountId,
      counterAccountId: input.counterAccountId ?? null,
      projectId: input.projectId ?? null,
      categoryId: input.categoryId ?? null,
      note: input.note?.trim() || null,
      createdBy: input.createdBy,
    },
  });

  // Sync tổng vào company_cash (giữ singleton để các view cũ vẫn dùng được).
  await tx.$executeRaw`
    UPDATE company_cash SET
      current_balance = COALESCE((SELECT SUM(current_balance) FROM cash_accounts WHERE active = true), 0),
      last_txn_at = NOW(),
      updated_at = NOW()
  `;

  return { txn, balanceAfter };
}
