import { NextResponse } from "next/server";
import { Prisma, WorkOrderOutputQcStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canApproveOutput } from "@/lib/eod";
import { canMarkOutputPassed, parseQcChecklist } from "@/lib/qc-mapping";
import { logProjectActivity } from "@/lib/project-activity-log";

const bodySchema = z.object({
  decision: z.enum(["passed", "failed", "rework", "pending"]),
  approvedQty: z.coerce.number().min(0).optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string; outputId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canApproveOutput({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được duyệt" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { decision, approvedQty, note } = parsed.data;

  const output = await prisma.workOrderOutput.findFirst({
    where: { id: params.outputId, projectId: params.id },
    select: {
      id: true,
      qcStatus: true,
      actualQty: true,
      workOrder: { select: { budgetItem: { select: { qcChecklist: true, name: true } } } },
      qcChecks: { select: { itemIndex: true, status: true, photoKey: true } },
    },
  });
  if (!output) return NextResponse.json({ message: "Không tìm thấy sản lượng" }, { status: 404 });

  // Default approvedQty to actualQty when not provided (TPTC "Duyệt full" flow)
  const approvedQtyFinal = decision === "passed" ? approvedQty ?? Number(output.actualQty) : null;

  if (decision === "passed") {
    const checklist = parseQcChecklist(output.workOrder.budgetItem.qcChecklist);
    const gate = canMarkOutputPassed(checklist, output.qcChecks);
    if (!gate.ok) {
      return NextResponse.json(
        { message: `Không thể duyệt: ${gate.reason}` },
        { status: 409 },
      );
    }
    if (approvedQtyFinal! > Number(output.actualQty)) {
      return NextResponse.json({ message: "Khối lượng duyệt không được vượt sản lượng thực" }, { status: 400 });
    }
  }

  const data: Prisma.WorkOrderOutputUpdateInput = {
    qcStatus: decision as WorkOrderOutputQcStatus,
    note: note ?? undefined,
  };
  if (decision === "passed") {
    data.approvedQty = new Prisma.Decimal(approvedQtyFinal as number);
    data.approvedBy = { connect: { id: user.id } };
    data.approvedAt = new Date();
  } else {
    data.approvedQty = null;
    data.approvedBy = { disconnect: true };
    data.approvedAt = null;
  }

  const updated = await prisma.workOrderOutput.update({
    where: { id: output.id },
    data,
    select: { id: true, qcStatus: true, approvedQty: true, approvedAt: true },
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "work_order_output",
    entityId: output.id,
    action: decision === "passed" ? "approve" : "update",
    summary: `Duyệt sản lượng "${output.workOrder.budgetItem.name}" → ${decision}${decision === "passed" ? ` (${approvedQtyFinal})` : ""}`,
    metadata: { decision, approvedQty: approvedQtyFinal ?? null },
  });

  return NextResponse.json({
    ok: true,
    output: {
      id: updated.id,
      qcStatus: updated.qcStatus,
      approvedQty: updated.approvedQty == null ? null : Number(updated.approvedQty),
      approvedAt: updated.approvedAt,
    },
  });
}
