import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const rows = await prisma.kpiSettings.findMany({
    orderBy: { effectiveFromMonth: "desc" },
    include: {
      changer: {
        select: { id: true, fullName: true, email: true },
      },
    },
  });

  return NextResponse.json({
    history: rows.map((row) => ({
      id: row.id,
      weightTienDo: row.weightTienDo,
      weightQc: row.weightQc,
      weightBaoCao: row.weightBaoCao,
      weightChuNha: row.weightChuNha,
      weightDongGop: row.weightDongGop,
      effectiveFromMonth: row.effectiveFromMonth,
      changedBy: row.changedBy,
      changedAt: row.changedAt.toISOString(),
      reason: row.reason,
      changer: row.changer,
    })),
  });
}
