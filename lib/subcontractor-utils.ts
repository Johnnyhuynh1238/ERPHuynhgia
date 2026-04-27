import { Prisma, SubcontractorStatus, SubcontractorType } from "@prisma/client";

export function normalizeSubcontractorState(input: {
  status?: SubcontractorStatus;
  isActive?: boolean;
  previousStatus?: SubcontractorStatus;
  previousIsActive?: boolean;
}) {
  let status = input.status ?? input.previousStatus ?? SubcontractorStatus.active;
  let isActive = input.isActive ?? input.previousIsActive ?? true;

  if (status === SubcontractorStatus.blacklisted) {
    isActive = false;
  }

  if (isActive === false && status === SubcontractorStatus.active) {
    status = SubcontractorStatus.inactive;
  }

  if (isActive === true && status === SubcontractorStatus.inactive) {
    status = SubcontractorStatus.active;
  }

  return { status, isActive };
}

export async function generateNextSubcontractorCode(tx: Prisma.TransactionClient) {
  const rows = await tx.subcontractor.findMany({
    where: { code: { startsWith: "SUB-" } },
    select: { code: true },
  });

  let maxNo = 0;
  for (const row of rows) {
    const matched = row.code.match(/^SUB-(\d+)$/);
    if (!matched) continue;
    const no = Number(matched[1]);
    if (Number.isFinite(no)) maxNo = Math.max(maxNo, no);
  }

  return `SUB-${String(maxNo + 1).padStart(3, "0")}`;
}

export function serializeSubcontractor(subcontractor: {
  id: string;
  code: string;
  name: string;
  type: SubcontractorType;
  taxCode: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  address: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
  status: SubcontractorStatus;
  notes: string | null;
  avgRating: Prisma.Decimal | null;
  totalContracts: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}) {
  return {
    ...subcontractor,
    avgRating: subcontractor.avgRating === null ? null : Number(subcontractor.avgRating),
  };
}
