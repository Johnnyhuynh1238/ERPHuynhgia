import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canLockLaborBudget } from "@/lib/labor-budget";

type RouteCtx = { params: { id: string } };

export async function POST(_req: Request, ctx: RouteCtx) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!canLockLaborBudget(user.role)) {
    return NextResponse.json({ message: "Chỉ TPTC/Admin được chốt dự toán" }, { status: 403 });
  }

  const accessWhere = buildProjectAccessWhere({ id: user.id, role: user.role });
  const project = await prisma.project.findFirst({
    where: { id: ctx.params.id, ...accessWhere },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ message: "Dự án không tồn tại hoặc không có quyền" }, { status: 404 });
  }

  const budget = await prisma.laborBudget.findUnique({
    where: { projectId: project.id },
    include: { items: { select: { id: true } } },
  });
  if (!budget) {
    return NextResponse.json({ message: "Chưa có dự toán để chốt" }, { status: 400 });
  }
  if (budget.status === "locked") {
    return NextResponse.json({ message: "Dự toán đã được chốt trước đó" }, { status: 409 });
  }
  if (budget.items.length === 0) {
    return NextResponse.json({ message: "Phải có ít nhất 1 đầu việc trước khi chốt" }, { status: 400 });
  }

  await prisma.laborBudget.update({
    where: { id: budget.id },
    data: {
      status: "locked",
      lockedAt: new Date(),
      lockedById: user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
