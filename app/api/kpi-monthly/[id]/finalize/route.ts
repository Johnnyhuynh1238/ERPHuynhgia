import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { toNumber } from "@/lib/kpi-salary";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser();
  if (!actor?.id || actor.role !== UserRole.admin) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const existed = await prisma.engineerKpiMonthly.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      totalScore: true,
      totalSalary: true,
      finalizedAt: true,
      finalizedBy: true,
    },
  });

  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy kỳ KPI tháng" }, { status: 404 });
  }

  if (existed.status === "finalized") {
    return NextResponse.json({
      message: "Kỳ KPI tháng đã được chốt trước đó",
      record: {
        id: existed.id,
        status: existed.status,
        totalScore: toNumber(existed.totalScore),
        totalSalary: toNumber(existed.totalSalary),
        finalizedAt: existed.finalizedAt?.toISOString() ?? null,
        finalizedBy: existed.finalizedBy,
      },
    });
  }

  const updated = await prisma.engineerKpiMonthly.update({
    where: { id: params.id },
    data: {
      status: "finalized",
      finalizedAt: new Date(),
      finalizedBy: actor.id,
    },
    select: {
      id: true,
      status: true,
      totalScore: true,
      totalSalary: true,
      finalizedAt: true,
      finalizedBy: true,
    },
  });

  return NextResponse.json({
    message: "Đã chốt KPI tháng",
    record: {
      id: updated.id,
      status: updated.status,
      totalScore: toNumber(updated.totalScore),
      totalSalary: toNumber(updated.totalSalary),
      finalizedAt: updated.finalizedAt?.toISOString() ?? null,
      finalizedBy: updated.finalizedBy,
    },
  });
}
