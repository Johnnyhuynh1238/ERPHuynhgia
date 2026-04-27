import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSubContractReadUser } from "@/lib/sub-contract-auth";
import {
  canViewAllSubContracts,
  canViewSubContractFinancial,
  parseSubContractStatus,
  serializeSubContract,
} from "@/lib/sub-contract-utils";

export async function GET(request: Request) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (!canViewAllSubContracts(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = parseSubContractStatus(searchParams.get("status"));
  const search = (searchParams.get("search") || "").trim();
  const projectId = (searchParams.get("projectId") || "").trim();

  const rows = await prisma.subContract.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { title: { contains: search, mode: "insensitive" } },
              { scopeOfWork: { contains: search, mode: "insensitive" } },
              { project: { code: { contains: search, mode: "insensitive" } } },
              { project: { name: { contains: search, mode: "insensitive" } } },
              { subcontractor: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      project: {
        select: { id: true, code: true, name: true },
      },
      subcontractor: {
        select: { id: true, code: true, name: true, phone: true },
      },
      linkedTasks: {
        include: {
          task: {
            select: { id: true, code: true, name: true, status: true },
          },
        },
      },
      _count: {
        select: { files: true, payments: true, evaluations: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const canViewFinancial = canViewSubContractFinancial(user.role);

  return NextResponse.json({
    contracts: rows.map((row) => {
      const serialized = serializeSubContract(row, canViewFinancial);
      return {
        ...serialized,
        unit: canViewFinancial ? serialized.unit : null,
        project: row.project,
        subcontractor: row.subcontractor,
        linkedTasks: row.linkedTasks.map((item) => item.task),
        fileCount: row._count.files,
        paymentCount: row._count.payments,
        evaluationCount: row._count.evaluations,
      };
    }),
    canViewFinancial,
    canCreate: user.role === UserRole.admin || user.role === UserRole.construction_manager,
  });
}
