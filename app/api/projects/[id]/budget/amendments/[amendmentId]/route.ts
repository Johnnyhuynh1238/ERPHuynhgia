import { NextResponse } from "next/server";
import { AmendmentStatus, BudgetCategory } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canApproveAmendment } from "@/lib/project-budget";
import { logProjectActivity } from "@/lib/project-activity-log";

const patchSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectReason: z.string().trim().max(500).optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; amendmentId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canApproveAmendment({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ admin được duyệt" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const amendment = await prisma.projectBudgetAmendment.findFirst({
    where: { id: params.amendmentId, budget: { projectId: params.id } },
    include: { budget: true, items: true },
  });
  if (!amendment) return NextResponse.json({ message: "Không tìm thấy điều chỉnh" }, { status: 404 });
  if (amendment.status !== AmendmentStatus.draft) {
    return NextResponse.json({ message: "Điều chỉnh đã được xử lý" }, { status: 409 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (parsed.data.action === "reject") {
    await prisma.projectBudgetAmendment.update({
      where: { id: amendment.id },
      data: {
        status: AmendmentStatus.rejected,
        approvedById: user.id,
        approvedAt: new Date(),
        rejectReason: parsed.data.rejectReason ?? null,
      },
    });

    await logProjectActivity(prisma, {
      projectId: params.id,
      actorId: user.id,
      entity: "project_budget_amendment",
      entityId: amendment.id,
      action: "reject",
      summary: `Từ chối điều chỉnh dự toán${parsed.data.rejectReason ? ` — ${parsed.data.rejectReason.slice(0, 80)}` : ""}`,
    });

    return NextResponse.json({ ok: true, status: AmendmentStatus.rejected });
  }

  // approve: apply delta to budget totals + append items
  await prisma.$transaction(async (tx) => {
    await tx.projectBudgetAmendment.update({
      where: { id: amendment.id },
      data: { status: AmendmentStatus.approved, approvedById: user.id, approvedAt: new Date() },
    });

    const nextSortRank = await tx.projectBudgetItem.aggregate({
      where: { budgetId: amendment.budgetId },
      _max: { sortRank: true },
    });
    const startRank = (nextSortRank._max.sortRank ?? 0) + 1;

    if (amendment.items.length > 0) {
      await tx.projectBudgetItem.createMany({
        data: amendment.items.map((it, idx) => ({
          budgetId: amendment.budgetId,
          category: it.category as BudgetCategory,
          phase: it.phase,
          phaseCode: it.phaseCode,
          name: it.name,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          amount: it.amount,
          note: it.note,
          sortRank: startRank + idx,
        })),
      });
    }

    await tx.projectBudget.update({
      where: { id: amendment.budgetId },
      data: {
        totalLabor: { increment: amendment.deltaLabor },
        totalMaterial: { increment: amendment.deltaMaterial },
        totalEquipment: { increment: amendment.deltaEquipment },
        totalAmount: { increment: amendment.deltaAmount },
      },
    });
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "project_budget_amendment",
    entityId: amendment.id,
    action: "approve",
    summary: `Duyệt điều chỉnh dự toán: ${Number(amendment.deltaAmount) >= 0 ? "+" : ""}${Number(amendment.deltaAmount).toLocaleString("vi-VN")}đ`,
    metadata: {
      deltaLabor: Number(amendment.deltaLabor),
      deltaMaterial: Number(amendment.deltaMaterial),
      deltaEquipment: Number(amendment.deltaEquipment),
      deltaAmount: Number(amendment.deltaAmount),
    },
  });

  return NextResponse.json({ ok: true, status: AmendmentStatus.approved });
}
