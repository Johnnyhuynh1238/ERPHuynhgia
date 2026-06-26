import { NextResponse } from "next/server";
import { Prisma, WorkOrderStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canCreateWorkOrder, canViewWorkOrders } from "@/lib/work-order";
import { logProjectActivity } from "@/lib/project-activity-log";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  date: z.string().regex(dateRegex, "Ngày không hợp lệ"),
  groupNo: z.coerce.number().int().min(1).max(99),
  budgetItemId: z.string().uuid(),
  targetQty: z.coerce.number().positive("Khối lượng phải > 0"),
  techNote: z.string().trim().max(500).optional().nullable(),
  workerIds: z.array(z.string().uuid()).min(1, "Cần ít nhất 1 thợ").max(20),
});

function atUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function serializeWorkOrder(wo: {
  id: string;
  date: Date;
  groupNo: number;
  budgetItemId: string;
  workItem: string;
  unit: string;
  unitPrice: bigint;
  targetQty: Prisma.Decimal;
  techNote: string | null;
  status: WorkOrderStatus;
  createdAt: Date;
  workers: Array<{ id: string; worker: { id: string; fullName: string; grade: number | null } }>;
  createdBy: { id: string; fullName: string };
  budgetItem: { id: string; phase: string; phaseCode: string; quantity: Prisma.Decimal };
}) {
  return {
    id: wo.id,
    date: wo.date.toISOString().slice(0, 10),
    groupNo: wo.groupNo,
    budgetItemId: wo.budgetItemId,
    budgetPhase: wo.budgetItem.phase,
    budgetPhaseCode: wo.budgetItem.phaseCode,
    budgetQty: Number(wo.budgetItem.quantity),
    workItem: wo.workItem,
    unit: wo.unit,
    unitPrice: Number(wo.unitPrice),
    targetQty: Number(wo.targetQty),
    techNote: wo.techNote,
    status: wo.status,
    createdBy: wo.createdBy,
    createdAt: wo.createdAt,
    workers: wo.workers.map((w) => ({ id: w.id, workerId: w.worker.id, fullName: w.worker.fullName, grade: w.worker.grade })),
  };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewWorkOrders({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const url = new URL(request.url);
  const dateStr = url.searchParams.get("date");
  const date = dateStr && dateRegex.test(dateStr) ? atUtcDate(dateStr) : null;

  const orders = await prisma.workOrder.findMany({
    where: { projectId: params.id, ...(date ? { date } : {}) },
    orderBy: [{ date: "desc" }, { groupNo: "asc" }],
    include: {
      budgetItem: { select: { id: true, phase: true, phaseCode: true, quantity: true } },
      createdBy: { select: { id: true, fullName: true } },
      workers: { include: { worker: { select: { id: true, fullName: true, grade: true } } } },
    },
    take: date ? undefined : 50,
  });

  // Labor budget items + workers available
  const budgetItems = await prisma.projectBudgetItem.findMany({
    where: { budget: { projectId: params.id }, category: "labor" },
    orderBy: [{ phaseCode: "asc" }, { sortRank: "asc" }],
    select: {
      id: true,
      phase: true,
      phaseCode: true,
      name: true,
      unit: true,
      quantity: true,
      unitPrice: true,
      sortRank: true,
    },
  });

  const workers = await prisma.worker.findMany({
    where: { projectId: params.id, workerStatus: "active" },
    orderBy: [{ grade: "desc" }, { fullName: "asc" }],
    select: { id: true, fullName: true, grade: true, dailyRate: true, role: true },
  });

  // Cumulative target qty per budget item (across all dates) for cảnh báo vượt dự toán
  const cumulativeRows = await prisma.workOrder.groupBy({
    by: ["budgetItemId"],
    where: { projectId: params.id },
    _sum: { targetQty: true },
  });
  const cumulative: Record<string, number> = {};
  for (const r of cumulativeRows) cumulative[r.budgetItemId] = Number(r._sum.targetQty ?? 0);

  return NextResponse.json({
    project,
    orders: orders.map(serializeWorkOrder),
    budgetItems: budgetItems.map((b) => ({
      id: b.id,
      phase: b.phase,
      phaseCode: b.phaseCode,
      name: b.name,
      unit: b.unit,
      quantity: Number(b.quantity),
      unitPrice: Number(b.unitPrice),
      assigned: cumulative[b.id] ?? 0,
    })),
    workers: workers.map((w) => ({ ...w, dailyRate: w.dailyRate ?? 0 })),
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canCreateWorkOrder({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền tạo phiếu" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });

  const payload = parsed.data;
  const date = atUtcDate(payload.date);

  const budgetItem = await prisma.projectBudgetItem.findFirst({
    where: { id: payload.budgetItemId, budget: { projectId: params.id }, category: "labor" },
    select: { id: true, name: true, unit: true, unitPrice: true },
  });
  if (!budgetItem) return NextResponse.json({ message: "Đầu việc không tồn tại trong dự toán nhân công" }, { status: 400 });

  const workers = await prisma.worker.findMany({
    where: { id: { in: payload.workerIds }, projectId: params.id, workerStatus: "active" },
    select: { id: true },
  });
  if (workers.length !== payload.workerIds.length) {
    return NextResponse.json({ message: "Có thợ không thuộc công trình hoặc không active" }, { status: 400 });
  }

  // Validate: thợ trong 1 ngày chỉ thuộc 1 nhóm
  const conflict = await prisma.workOrderWorker.findFirst({
    where: {
      workerId: { in: payload.workerIds },
      workOrder: { projectId: params.id, date },
    },
    include: { worker: { select: { fullName: true } }, workOrder: { select: { groupNo: true } } },
  });
  if (conflict) {
    return NextResponse.json(
      { message: `Thợ ${conflict.worker.fullName} đã thuộc nhóm ${conflict.workOrder.groupNo} hôm nay` },
      { status: 409 },
    );
  }

  // Validate unique (projectId, date, groupNo)
  const existing = await prisma.workOrder.findFirst({
    where: { projectId: params.id, date, groupNo: payload.groupNo },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ message: `Nhóm ${payload.groupNo} đã có phiếu hôm nay` }, { status: 409 });
  }

  const wo = await prisma.workOrder.create({
    data: {
      projectId: params.id,
      date,
      groupNo: payload.groupNo,
      budgetItemId: budgetItem.id,
      workItem: budgetItem.name,
      unit: budgetItem.unit,
      unitPrice: budgetItem.unitPrice,
      targetQty: new Prisma.Decimal(payload.targetQty),
      techNote: payload.techNote ?? null,
      createdById: user.id,
      workers: { create: payload.workerIds.map((wid) => ({ workerId: wid })) },
    },
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "work_order",
    entityId: wo.id,
    action: "create",
    summary: `Tạo phiếu giao việc nhóm ${payload.groupNo} ngày ${payload.date}: ${budgetItem.name} (${payload.targetQty} ${budgetItem.unit}, ${payload.workerIds.length} thợ)`,
    metadata: { groupNo: payload.groupNo, date: payload.date, workerCount: payload.workerIds.length },
  });

  return NextResponse.json({ ok: true, workOrderId: wo.id });
}
