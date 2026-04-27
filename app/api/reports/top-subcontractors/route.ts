import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function canAccess(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
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
  const limitRaw = Number(searchParams.get("limit") || 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 50) : 10;

  const rows = await prisma.subcontractor.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      avgRating: true,
      totalContracts: true,
      contracts: {
        select: {
          evaluations: {
            select: {
              willHireAgain: true,
            },
          },
        },
      },
    },
  });

  const top = rows
    .map((row) => {
      const evals = row.contracts.flatMap((c) => c.evaluations);
      const evaluationCount = evals.length;
      const willHireAgainCount = evals.filter((x) => x.willHireAgain).length;
      const avgRating = row.avgRating === null ? null : Number(row.avgRating);
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        avgRating,
        totalContracts: row.totalContracts,
        evaluationCount,
        willHireAgainRate: evaluationCount > 0 ? Math.round((willHireAgainCount / evaluationCount) * 100) : 0,
      };
    })
    .sort((a, b) => {
      const aRating = a.avgRating ?? -1;
      const bRating = b.avgRating ?? -1;
      if (bRating !== aRating) return bRating - aRating;
      if (b.evaluationCount !== a.evaluationCount) return b.evaluationCount - a.evaluationCount;
      return b.totalContracts - a.totalContracts;
    })
    .slice(0, limit);

  return NextResponse.json({ top });
}
