import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canCreateWorkOrder } from "@/lib/work-order";
import { logProjectActivity } from "@/lib/project-activity-log";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const bodySchema = z.object({
  sourceDate: z.string().regex(dateRegex),
  targetDate: z.string().regex(dateRegex),
});

function atUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canCreateWorkOrder({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });

  const source = atUtcDate(parsed.data.sourceDate);
  const target = atUtcDate(parsed.data.targetDate);
  if (source.getTime() === target.getTime()) {
    return NextResponse.json({ message: "Ngày nguồn và đích trùng nhau" }, { status: 400 });
  }

  const existingOnTarget = await prisma.workOrder.findMany({
    where: { projectId: params.id, date: target },
    select: { groupNo: true },
  });
  if (existingOnTarget.length > 0) {
    return NextResponse.json({ message: "Ngày đích đã có phiếu, hãy xóa trước khi nhân bản" }, { status: 409 });
  }

  const sourceOrders = await prisma.workOrder.findMany({
    where: { projectId: params.id, date: source },
    include: { workers: true },
  });
  if (sourceOrders.length === 0) {
    return NextResponse.json({ message: "Ngày nguồn không có phiếu" }, { status: 404 });
  }

  let cloned = 0;
  await prisma.$transaction(async (tx) => {
    for (const src of sourceOrders) {
      const wo = await tx.workOrder.create({
        data: {
          projectId: params.id,
          date: target,
          groupNo: src.groupNo,
          budgetItemId: src.budgetItemId,
          workItem: src.workItem,
          unit: src.unit,
          unitPrice: src.unitPrice,
          targetQty: src.targetQty,
          techNote: src.techNote,
          createdById: user.id,
          workers: { create: src.workers.map((w) => ({ workerId: w.workerId })) },
        },
      });
      void wo;
      cloned += 1;
    }
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "work_order",
    action: "clone",
    summary: `Nhân bản ${cloned} phiếu giao việc từ ${parsed.data.sourceDate} sang ${parsed.data.targetDate}`,
    metadata: { sourceDate: parsed.data.sourceDate, targetDate: parsed.data.targetDate, cloned },
  });

  return NextResponse.json({ ok: true, cloned });
}
