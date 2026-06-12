import { NextResponse } from "next/server";
import { Prisma, WorkOrderStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canDeleteWorkOrder, canEditWorkOrder } from "@/lib/work-order";
import { logProjectActivity } from "@/lib/project-activity-log";

const patchSchema = z.object({
  targetQty: z.coerce.number().positive().optional(),
  techNote: z.string().trim().max(500).nullable().optional(),
  status: z.nativeEnum(WorkOrderStatus).optional(),
  workerIds: z.array(z.string().uuid()).min(1).max(20).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string; woId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditWorkOrder({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const wo = await prisma.workOrder.findFirst({
    where: { id: params.woId, projectId: params.id },
    include: { workers: true },
  });
  if (!wo) return NextResponse.json({ message: "Không tìm thấy phiếu" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });

  const payload = parsed.data;

  if (payload.workerIds) {
    const workers = await prisma.worker.findMany({
      where: { id: { in: payload.workerIds }, projectId: params.id, workerStatus: "active" },
      select: { id: true },
    });
    if (workers.length !== payload.workerIds.length) {
      return NextResponse.json({ message: "Có thợ không thuộc công trình hoặc không active" }, { status: 400 });
    }
    const conflict = await prisma.workOrderWorker.findFirst({
      where: {
        workerId: { in: payload.workerIds },
        workOrderId: { not: wo.id },
        workOrder: { projectId: params.id, date: wo.date },
      },
      include: { worker: { select: { fullName: true } }, workOrder: { select: { groupNo: true } } },
    });
    if (conflict) {
      return NextResponse.json(
        { message: `Thợ ${conflict.worker.fullName} đã thuộc nhóm ${conflict.workOrder.groupNo} hôm đó` },
        { status: 409 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id: wo.id },
      data: {
        ...(payload.targetQty !== undefined ? { targetQty: new Prisma.Decimal(payload.targetQty) } : {}),
        ...(payload.techNote !== undefined ? { techNote: payload.techNote } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
      },
    });
    if (payload.workerIds) {
      await tx.workOrderWorker.deleteMany({ where: { workOrderId: wo.id } });
      await tx.workOrderWorker.createMany({
        data: payload.workerIds.map((wid) => ({ workOrderId: wo.id, workerId: wid })),
      });
    }
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "work_order",
    entityId: wo.id,
    action: "update",
    summary: `Cập nhật phiếu giao việc nhóm ${wo.groupNo} ngày ${wo.date.toISOString().slice(0, 10)}`,
    metadata: { changes: Object.keys(payload) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string; woId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canDeleteWorkOrder({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const wo = await prisma.workOrder.findFirst({
    where: { id: params.woId, projectId: params.id },
    select: { id: true, groupNo: true, date: true, workItem: true },
  });
  if (!wo) return NextResponse.json({ message: "Không tìm thấy phiếu" }, { status: 404 });

  await prisma.workOrder.delete({ where: { id: wo.id } });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "work_order",
    entityId: wo.id,
    action: "delete",
    summary: `Xóa phiếu giao việc nhóm ${wo.groupNo} ngày ${wo.date.toISOString().slice(0, 10)}: ${wo.workItem}`,
  });

  return NextResponse.json({ ok: true });
}
