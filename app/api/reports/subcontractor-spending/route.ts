import { SubPaymentStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function canAccess(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager || role === UserRole.accountant;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!canAccess(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = (searchParams.get("projectId") || "").trim();

  const rows = await prisma.subPayment.findMany({
    where: {
      status: SubPaymentStatus.paid,
      ...(projectId ? { subContract: { projectId } } : {}),
    },
    select: {
      actualAmount: true,
      expectedAmount: true,
      subContract: {
        select: {
          project: { select: { id: true, code: true, name: true } },
          subcontractor: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });

  const map = new Map<string, {
    projectId: string;
    projectCode: string;
    projectName: string;
    subcontractorId: string;
    subcontractorCode: string;
    subcontractorName: string;
    totalPaid: number;
    paymentCount: number;
  }>();

  for (const row of rows) {
    const project = row.subContract.project;
    const subcontractor = row.subContract.subcontractor;
    const key = `${project.id}__${subcontractor.id}`;
    const current = map.get(key) || {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      subcontractorId: subcontractor.id,
      subcontractorCode: subcontractor.code,
      subcontractorName: subcontractor.name,
      totalPaid: 0,
      paymentCount: 0,
    };

    current.totalPaid += Number(row.actualAmount ?? row.expectedAmount ?? 0);
    current.paymentCount += 1;

    map.set(key, current);
  }

  const spending = Array.from(map.values())
    .map((item) => ({
      ...item,
      totalPaid: Math.round(item.totalPaid * 100) / 100,
    }))
    .sort((a, b) => b.totalPaid - a.totalPaid);

  return NextResponse.json({ spending });
}
