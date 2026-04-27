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
  return role === UserRole.admin || role === UserRole.construction_manager;
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
