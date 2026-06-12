import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canApproveGrade } from "@/lib/worker-management";

export async function PATCH(
  request: Request,
  { params }: { params: { workerId: string; proposalId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !canApproveGrade(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const action = (body as Record<string, unknown> | null)?.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ message: "Action phải là approve|reject" }, { status: 400 });
  }

  const proposal = await prisma.gradeHistory.findUnique({
    where: { id: params.proposalId },
    select: { id: true, workerId: true, toGrade: true, status: true },
  });
  if (!proposal || proposal.workerId !== params.workerId) {
    return NextResponse.json({ message: "Không tìm thấy đề xuất" }, { status: 404 });
  }
  if (proposal.status !== "pending") {
    return NextResponse.json({ message: "Đề xuất đã xử lý" }, { status: 409 });
  }

  if (action === "approve") {
    const rate = await prisma.gradeRate.findFirst({
      where: { grade: proposal.toGrade, isCurrent: true },
      select: { dailyRate: true },
    });
    await prisma.$transaction([
      prisma.gradeHistory.update({
        where: { id: proposal.id },
        data: {
          status: "approved",
          approvedById: user.id,
          approvedAt: new Date(),
        },
      }),
      prisma.worker.update({
        where: { id: proposal.workerId },
        data: {
          grade: proposal.toGrade,
          ...(rate ? { dailyRate: rate.dailyRate } : {}),
        },
      }),
    ]);
    return NextResponse.json({ ok: true, status: "approved" });
  }

  const rejectReason =
    typeof (body as Record<string, unknown>).rejectReason === "string"
      ? ((body as Record<string, unknown>).rejectReason as string).trim() || null
      : null;

  await prisma.gradeHistory.update({
    where: { id: proposal.id },
    data: {
      status: "rejected",
      approvedById: user.id,
      approvedAt: new Date(),
      rejectReason,
    },
  });
  return NextResponse.json({ ok: true, status: "rejected" });
}
