import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canApproveAmendment } from "@/lib/labor-budget";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3, "Lý do từ chối tối thiểu 3 ký tự").max(500) }),
]);

type RouteCtx = { params: { id: string; amendmentId: string } };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!canApproveAmendment(user.role)) {
    return NextResponse.json({ message: "Chỉ GĐ được duyệt điều chỉnh" }, { status: 403 });
  }

  const accessWhere = buildProjectAccessWhere({ id: user.id, role: user.role });
  const project = await prisma.project.findFirst({
    where: { id: ctx.params.id, ...accessWhere },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ message: "Dự án không tồn tại hoặc không có quyền" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Body không hợp lệ" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const amendment = await prisma.budgetAmendment.findUnique({
    where: { id: ctx.params.amendmentId },
    include: { budget: { select: { id: true, projectId: true, totalAmount: true } } },
  });
  if (!amendment || amendment.budget.projectId !== project.id) {
    return NextResponse.json({ message: "Không tìm thấy điều chỉnh" }, { status: 404 });
  }
  if (amendment.status !== "draft") {
    return NextResponse.json({ message: "Điều chỉnh đã được xử lý" }, { status: 409 });
  }

  if (parsed.data.action === "approve") {
    const newTotal = BigInt(Number(amendment.budget.totalAmount)) + BigInt(Number(amendment.deltaAmount));
    await prisma.$transaction([
      prisma.budgetAmendment.update({
        where: { id: amendment.id },
        data: { status: "approved", approvedById: user.id, approvedAt: new Date() },
      }),
      prisma.laborBudget.update({
        where: { id: amendment.budget.id },
        data: { totalAmount: newTotal },
      }),
    ]);
  } else {
    await prisma.budgetAmendment.update({
      where: { id: amendment.id },
      data: {
        status: "rejected",
        approvedById: user.id,
        approvedAt: new Date(),
        rejectReason: parsed.data.reason,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
