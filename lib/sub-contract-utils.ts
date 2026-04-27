import { Prisma, SubContractStatus, SubContractUnit, UserRole } from "@prisma/client";

export function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

export async function generateNextSubContractCode(tx: Prisma.TransactionClient, date = new Date()) {
  const year = date.getUTCFullYear();
  const prefix = `SC-${year}-`;

  const rows = await tx.subContract.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });

  let maxNo = 0;
  for (const row of rows) {
    const matched = row.code.match(new RegExp(`^SC-${year}-(\\d+)$`));
    if (!matched) continue;
    const no = Number(matched[1]);
    if (Number.isFinite(no)) maxNo = Math.max(maxNo, no);
  }

  return `${prefix}${String(maxNo + 1).padStart(3, "0")}`;
}

export function canWriteSubContract(role: UserRole | string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

export function canViewAllSubContracts(role: UserRole | string) {
  return role === UserRole.admin || role === UserRole.construction_manager || role === UserRole.accountant;
}

export function canViewSubContractFinancial(role: UserRole | string) {
  return role === UserRole.admin || role === UserRole.construction_manager || role === UserRole.accountant;
}

export function serializeSubContract<T extends {
  unitPrice: Prisma.Decimal | null;
  quantity: Prisma.Decimal | null;
  contractValue: Prisma.Decimal;
}>(contract: T, canViewFinancial: boolean) {
  return {
    ...contract,
    unitPrice: canViewFinancial ? (contract.unitPrice === null ? null : Number(contract.unitPrice)) : null,
    quantity: canViewFinancial ? (contract.quantity === null ? null : Number(contract.quantity)) : null,
    contractValue: canViewFinancial ? Number(contract.contractValue) : null,
  };
}

export function parseSubContractStatus(input: string | null): SubContractStatus | null {
  if (!input || input === "all") return null;
  if (
    [SubContractStatus.draft, SubContractStatus.active, SubContractStatus.completed, SubContractStatus.cancelled].includes(
      input as SubContractStatus,
    )
  ) {
    return input as SubContractStatus;
  }
  return null;
}

export function parseSubContractUnit(input: string | null | undefined): SubContractUnit {
  if (input && [SubContractUnit.lump_sum, SubContractUnit.per_m2, SubContractUnit.per_day, SubContractUnit.per_unit].includes(input as SubContractUnit)) {
    return input as SubContractUnit;
  }
  return SubContractUnit.lump_sum;
}

export function appendCancelReason(existingNotes: string | null, reason: string) {
  const mark = `[Hủy HĐ ${new Date().toISOString()}] ${reason}`;
  return existingNotes ? `${existingNotes}\n${mark}` : mark;
}
