import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { toNumber } from "@/lib/kpi-salary";
import { prisma } from "@/lib/prisma";

function canReadSalaryHistory(viewer: { id?: string | null; role?: string | null } | null, userId: string) {
  if (!viewer?.id || !viewer.role) return false;
  if (viewer.role === UserRole.admin) return true;
  return viewer.id === userId;
}

export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer?.id || !viewer.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!canReadSalaryHistory(viewer, params.userId)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const config = await prisma.engineerSalaryConfig.findUnique({
    where: { userId: params.userId },
    select: { id: true },
  });

  if (!config) {
    return NextResponse.json({ history: [] });
  }

  const history = await prisma.engineerSalaryHistory.findMany({
    where: { configId: config.id },
    include: {
      changer: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: [{ effectiveFrom: "desc" }, { changedAt: "desc" }],
  });

  return NextResponse.json({
    history: history.map((item) => ({
      id: item.id,
      salaryMax: toNumber(item.salaryMax),
      effectiveFrom: item.effectiveFrom.toISOString().slice(0, 10),
      changeReason: item.changeReason,
      changedAt: item.changedAt.toISOString(),
      changedBy: item.changer.fullName,
      changedById: item.changedBy,
    })),
  });
}
