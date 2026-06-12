import { NextResponse } from "next/server";
import { BudgetStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canLockBudget } from "@/lib/project-budget";
import { logProjectActivity } from "@/lib/project-activity-log";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canLockBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được chốt" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const budget = await prisma.projectBudget.findUnique({ where: { projectId: params.id } });
  if (!budget) return NextResponse.json({ message: "Chưa có dự toán để chốt" }, { status: 404 });
  if (budget.status === BudgetStatus.locked) {
    return NextResponse.json({ message: "Dự toán đã chốt" }, { status: 409 });
  }

  const updated = await prisma.projectBudget.update({
    where: { id: budget.id },
    data: { status: BudgetStatus.locked, lockedById: user.id, lockedAt: new Date() },
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "project_budget",
    entityId: budget.id,
    action: "lock",
    summary: `Chốt dự toán: ${Number(updated.totalAmount).toLocaleString("vi-VN")}đ`,
    metadata: { totalAmount: Number(updated.totalAmount) },
  });

  return NextResponse.json({ ok: true });
}
