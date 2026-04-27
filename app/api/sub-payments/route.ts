import { SubPaymentStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { canViewSubContractFinancial } from "@/lib/sub-contract-utils";
import { serializeSubPayment } from "@/lib/sub-payment-utils";

function parseStatus(input: string | null) {
  if (!input || input === "all") return null;
  if (Object.values(SubPaymentStatus).includes(input as SubPaymentStatus)) return input as SubPaymentStatus;
  return null;
}

export async function GET(request: Request) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = parseStatus(searchParams.get("status"));
  const search = (searchParams.get("search") || "").trim();

  const rows = await prisma.subPayment.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { subContract: { code: { contains: search, mode: "insensitive" } } },
              { subContract: { title: { contains: search, mode: "insensitive" } } },
              { subContract: { subcontractor: { name: { contains: search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    include: {
      subContract: {
        select: {
          id: true,
          code: true,
          title: true,
          contractValue: true,
          project: { select: { id: true, code: true, name: true } },
          subcontractor: { select: { id: true, code: true, name: true, phone: true } },
        },
      },
      linkedTask: { select: { id: true, code: true, name: true, status: true } },
      requester: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
      payer: { select: { id: true, fullName: true } },
    },
    orderBy: [{ status: "asc" }, { expectedDate: "asc" }, { createdAt: "desc" }],
  });

  const canViewFinancial = canViewSubContractFinancial(user.role);

  return NextResponse.json({
    rows: rows.map((row) => serializeSubPayment(row, canViewFinancial)),
    canViewFinancial,
    canMarkPaid: user.role === UserRole.admin || user.role === UserRole.accountant,
  });
}
