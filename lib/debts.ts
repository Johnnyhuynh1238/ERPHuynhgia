import { ExpenseStatus, Prisma, ReceiptStatus } from "@prisma/client";

// Chỉ tính vào số dư khi giao dịch đã thực hiện (chi/thu xong).
export const PAID_EXPENSE = ExpenseStatus.paid;
export const RECEIVED_RECEIPT = ReceiptStatus.received;
// Đang chờ = còn treo (chưa duyệt / chưa chi-thu).
export const PENDING_EXPENSE: ExpenseStatus[] = [ExpenseStatus.pending, ExpenseStatus.tptc_pending];
export const PENDING_RECEIPT: ReceiptStatus[] = [ReceiptStatus.pending, ReceiptStatus.awaiting_approval];

// Gộp giao dịch của 1 khoản vay thành số dư gốc/lãi.
export function summarizeLoan(loan: {
  principal: Prisma.Decimal;
  expenses: { amount: Prisma.Decimal; status: ExpenseStatus; category: { code: string } }[];
  receipts: { amount: Prisma.Decimal; status: ReceiptStatus }[];
}) {
  let principalPaid = 0;
  let interestPaid = 0;
  let principalPending = 0;
  let interestPending = 0;
  for (const e of loan.expenses) {
    const amt = Number(e.amount);
    const isInterest = e.category.code === "LAIVAY";
    if (e.status === PAID_EXPENSE) {
      if (isInterest) interestPaid += amt;
      else principalPaid += amt;
    } else if (PENDING_EXPENSE.includes(e.status)) {
      if (isInterest) interestPending += amt;
      else principalPending += amt;
    }
  }
  let disbursed = 0;
  let disbursedPending = 0;
  for (const r of loan.receipts) {
    const amt = Number(r.amount);
    if (r.status === RECEIVED_RECEIPT) disbursed += amt;
    else if (PENDING_RECEIPT.includes(r.status)) disbursedPending += amt;
  }
  const principal = Number(loan.principal);
  return {
    principal,
    disbursed,
    disbursedPending,
    principalPaid,
    principalPending,
    interestPaid,
    interestPending,
    outstanding: principal - principalPaid,
  };
}

// Gộp giao dịch của 1 phiếu tạm ứng thành số dư còn phải hoàn.
export function summarizeAdvance(advance: {
  amount: Prisma.Decimal;
  expenses: { amount: Prisma.Decimal; status: ExpenseStatus }[];
  receipts: { amount: Prisma.Decimal; status: ReceiptStatus }[];
}) {
  let paidOut = 0; // đã chi ứng
  let paidOutPending = 0;
  for (const e of advance.expenses) {
    const amt = Number(e.amount);
    if (e.status === PAID_EXPENSE) paidOut += amt;
    else if (PENDING_EXPENSE.includes(e.status)) paidOutPending += amt;
  }
  let returned = 0; // đã hoàn ứng
  let returnedPending = 0;
  for (const r of advance.receipts) {
    const amt = Number(r.amount);
    if (r.status === RECEIVED_RECEIPT) returned += amt;
    else if (PENDING_RECEIPT.includes(r.status)) returnedPending += amt;
  }
  const amount = Number(advance.amount);
  return {
    amount,
    paidOut,
    paidOutPending,
    returned,
    returnedPending,
    // Dư ứng chưa hoàn = tiền đã chi ứng − tiền đã hoàn.
    outstanding: paidOut - returned,
  };
}
