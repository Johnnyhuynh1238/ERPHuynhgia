import { Prisma, SubPaymentStatus, UserRole } from "@prisma/client";

export function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

export async function generateNextSubPaymentCode(tx: Prisma.TransactionClient, date = new Date()) {
  const year = date.getUTCFullYear();
  const prefix = `SCP-${year}-`;

  const rows = await tx.subPayment.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });

  let maxNo = 0;
  for (const row of rows) {
    const matched = row.code.match(new RegExp(`^SCP-${year}-(\\d+)$`));
    if (!matched) continue;
    const no = Number(matched[1]);
    if (Number.isFinite(no)) maxNo = Math.max(maxNo, no);
  }

  return `${prefix}${String(maxNo + 1).padStart(3, "0")}`;
}

export function canCreateOrRequestSubPayment(role: UserRole | string) {
  return (
    role === UserRole.admin ||
    role === UserRole.construction_manager ||
    role === UserRole.accountant
  );
}

export function canApproveSubPayment(role: UserRole | string) {
  return role === UserRole.admin;
}

export function canMarkPaidSubPayment(role: UserRole | string) {
  return role === UserRole.admin || role === UserRole.accountant;
}

export function canPatchOrDeleteSubPayment(role: UserRole | string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

export function normalizeSubPaymentDate(raw?: string | null) {
  if (!raw) return null;
  const [year, month, day] = raw.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

export function deriveExpectedValues(params: {
  contractValue: number;
  percentage?: number | null;
  expectedAmount?: number | null;
}) {
  const contractValue = params.contractValue;
  const inputPercentage = params.percentage == null ? null : Number(params.percentage);
  const inputAmount = params.expectedAmount == null ? null : Number(params.expectedAmount);

  if (!Number.isFinite(contractValue) || contractValue <= 0) {
    throw new Error("Giá trị hợp đồng không hợp lệ");
  }

  if ((inputPercentage == null || inputPercentage <= 0) && (inputAmount == null || inputAmount <= 0)) {
    throw new Error("Mỗi đợt phải có % hoặc số tiền dự kiến > 0");
  }

  if (inputPercentage != null && !Number.isFinite(inputPercentage)) {
    throw new Error("Phần trăm không hợp lệ");
  }

  if (inputAmount != null && !Number.isFinite(inputAmount)) {
    throw new Error("Số tiền không hợp lệ");
  }

  let percentage = inputPercentage;
  let expectedAmount = inputAmount;

  if ((expectedAmount == null || expectedAmount <= 0) && percentage != null && percentage > 0) {
    expectedAmount = (contractValue * percentage) / 100;
  }

  if ((percentage == null || percentage <= 0) && expectedAmount != null && expectedAmount > 0) {
    percentage = (expectedAmount / contractValue) * 100;
  }

  if (!percentage || percentage <= 0 || !expectedAmount || expectedAmount <= 0) {
    throw new Error("Không thể tính % hoặc số tiền đợt thanh toán");
  }

  const roundedPercentage = Math.round(percentage * 100) / 100;
  const roundedExpectedAmount = Math.round(expectedAmount * 100) / 100;

  return {
    percentage: roundedPercentage,
    expectedAmount: roundedExpectedAmount,
  };
}

export function serializeSubPayment<T extends {
  expectedAmount: Prisma.Decimal;
  percentage: Prisma.Decimal | null;
  actualAmount: Prisma.Decimal | null;
}>(row: T, canViewFinancial: boolean) {
  return {
    ...row,
    expectedAmount: canViewFinancial ? Number(row.expectedAmount) : null,
    percentage: canViewFinancial ? (row.percentage == null ? null : Number(row.percentage)) : null,
    actualAmount: canViewFinancial ? (row.actualAmount == null ? null : Number(row.actualAmount)) : null,
  };
}

export function getPaidProgressWarning(totalPaidAfter: number, contractValue: number) {
  if (contractValue <= 0) return null;
  const ratio = totalPaidAfter / contractValue;
  if (ratio > 1) {
    return { type: "overflow", message: "Tổng đã chi vượt giá trị hợp đồng" as const };
  }
  if (ratio > 0.95) {
    return { type: "warning", message: "Tổng đã chi vượt ngưỡng 95% giá trị hợp đồng" as const };
  }
  return null;
}

export const SUB_PAYMENT_EDITABLE_STATUSES = [
  SubPaymentStatus.pending,
  SubPaymentStatus.requested,
  SubPaymentStatus.approved,
] as const;

// Đợt "tạm ứng dở" (cách A — suy từ số): đã chi > 0 nhưng chưa đủ dự kiến & chưa paid/huỷ.
export function isSubPaymentAdvancing(p: {
  status: SubPaymentStatus;
  expectedAmount: number | Prisma.Decimal | null;
  actualAmount: number | Prisma.Decimal | null;
}) {
  if (p.status === SubPaymentStatus.paid || p.status === SubPaymentStatus.cancelled) return false;
  const actual = Number(p.actualAmount || 0);
  const expected = Number(p.expectedAmount || 0);
  return actual > 0 && (expected <= 0 || actual < expected - 1);
}

// Số tiền CÒN LẠI của đợt (dự kiến − đã tạm ứng), tối thiểu 0.
export function subPaymentRemaining(p: {
  expectedAmount: number | Prisma.Decimal | null;
  actualAmount: number | Prisma.Decimal | null;
}) {
  return Math.max(0, Number(p.expectedAmount || 0) - Number(p.actualAmount || 0));
}

// Chi vượt tổng số tiền đợt → chặn (luật "không thanh toán vượt đợt").
export class SubPaymentOverpayError extends Error {
  constructor(public expected: number, public attempted: number) {
    super(
      `Tổng chi ${Math.round(attempted).toLocaleString("vi-VN")}đ vượt số tiền đợt ${Math.round(
        expected,
      ).toLocaleString("vi-VN")}đ — không được thanh toán vượt đợt.`,
    );
    this.name = "SubPaymentOverpayError";
  }
}

// Cộng dồn 1 lần chi (tạm ứng) vào đợt trong 1 transaction.
// Đủ dự kiến → status=paid (ghi paidBy/paidAt). Chưa đủ → giữ 'approved' (đợt mở,
// nút gửi lệnh chi vẫn hiện). Vượt tổng đợt → ném SubPaymentOverpayError (rollback).
export async function settleSubPaymentInstallment(
  tx: Prisma.TransactionClient,
  opts: {
    subPaymentId: string;
    paidAmount: number;
    paidDate: Date;
    userId: string;
    receiptUrl?: string | null;
    payNote?: string | null;
  },
) {
  const sp = await tx.subPayment.findUnique({
    where: { id: opts.subPaymentId },
    select: { expectedAmount: true, actualAmount: true },
  });
  if (!sp) throw new Error("Không tìm thấy đợt thanh toán");

  const expected = Number(sp.expectedAmount || 0);
  const prevPaid = Number(sp.actualAmount || 0);
  const newTotal = prevPaid + opts.paidAmount;
  if (expected > 0 && newTotal > expected + 1) {
    throw new SubPaymentOverpayError(expected, newTotal);
  }
  const fullyPaid = expected > 0 ? newTotal >= expected - 1 : true;

  await tx.subPayment.update({
    where: { id: opts.subPaymentId },
    data: {
      actualAmount: new Prisma.Decimal(newTotal),
      actualPaidDate: opts.paidDate,
      status: fullyPaid ? SubPaymentStatus.paid : SubPaymentStatus.approved,
      ...(fullyPaid ? { paidBy: opts.userId, paidAt: new Date() } : {}),
      ...(opts.receiptUrl != null ? { receiptUrl: opts.receiptUrl } : {}),
      ...(opts.payNote != null ? { payNote: opts.payNote } : {}),
    },
  });
  return { fullyPaid, newTotal, expected, prevPaid };
}
