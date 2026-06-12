import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canViewWorkers } from "@/lib/worker-management";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !canViewWorkers(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const rates = await prisma.gradeRate.findMany({
    where: { isCurrent: true },
    orderBy: { grade: "asc" },
    select: { grade: true, dailyRate: true, note: true, effectiveAt: true },
  });

  return NextResponse.json({ rates });
}
