import { NextResponse } from "next/server";
import { Prisma, TimesheetAbsentReason, WorkOrderOutputQcStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditEod, canViewEod, deriveDayValue, weekKeyForDate } from "@/lib/eod";
import { parseQcChecklist } from "@/lib/qc-mapping";
import { logProjectActivity } from "@/lib/project-activity-log";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const dayValueSchema = z.union([z.literal(0), z.literal(0.5), z.literal(1)]);

const saveSchema = z.object({
  date: z.string().regex(dateRegex, "Ngày không hợp lệ"),
  timesheets: z
    .array(
      z.object({
        workerId: z.string().uuid(),
        dayValue: dayValueSchema,
        absentReason: z.nativeEnum(TimesheetAbsentReason).nullable().optional(),
        note: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .max(200),
  outputs: z
    .array(
      z.object({
        workOrderId: z.string().uuid(),
        actualQty: z.coerce.number().min(0),
        note: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .max(200),
});

function atUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewEod({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const url = new URL(request.url);
  const dateStr = url.searchParams.get("date");
  if (!dateStr || !dateRegex.test(dateStr)) {
    return NextResponse.json({ message: "Thiếu hoặc sai tham số date" }, { status: 400 });
  }
  const date = atUtcDate(dateStr);

  const [orders, attendances, timesheets] = await Promise.all([
    prisma.workOrder.findMany({
      where: { projectId: params.id, date },
      orderBy: { groupNo: "asc" },
      include: {
        workers: { include: { worker: { select: { id: true, fullName: true, grade: true } } } },
        budgetItem: { select: { qcChecklist: true } },
        output: {
          include: {
            photos: { orderBy: { sortRank: "asc" } },
            qcChecks: { orderBy: { itemIndex: "asc" } },
          },
        },
      },
    }),
    prisma.workerAttendance.findMany({
      where: { projectId: params.id, date },
      select: { workerId: true, session: true, present: true },
    }),
    prisma.workerTimesheet.findMany({
      where: { projectId: params.id, date },
      select: {
        workerId: true,
        dayValue: true,
        absentReason: true,
        note: true,
      },
    }),
  ]);

  // Tập thợ trong ngày = union (thợ trong work orders hôm đó) + (thợ đã chấm công sáng/chiều)
  const workerIdSet = new Set<string>();
  for (const o of orders) for (const w of o.workers) workerIdSet.add(w.workerId);
  for (const a of attendances) workerIdSet.add(a.workerId);
  for (const t of timesheets) workerIdSet.add(t.workerId);

  const workers = workerIdSet.size
    ? await prisma.worker.findMany({
        where: { id: { in: Array.from(workerIdSet) } },
        select: { id: true, fullName: true, grade: true, dailyRate: true, workerStatus: true },
      })
    : [];

  const morningMap = new Map<string, boolean>();
  const afternoonMap = new Map<string, boolean>();
  for (const a of attendances) {
    if (a.session === "morning") morningMap.set(a.workerId, a.present);
    else afternoonMap.set(a.workerId, a.present);
  }

  const tsMap = new Map(timesheets.map((t) => [t.workerId, t]));

  const workerRows = workers.map((w) => {
    const ts = tsMap.get(w.id);
    const morning = morningMap.get(w.id) ?? false;
    const afternoon = afternoonMap.get(w.id) ?? false;
    const derived = deriveDayValue(morning, afternoon);
    const dayValue = ts ? Number(ts.dayValue) : derived === 0 && !morningMap.has(w.id) && !afternoonMap.has(w.id) ? 1 : derived;
    return {
      workerId: w.id,
      fullName: w.fullName,
      grade: w.grade,
      dailyRate: w.dailyRate ?? 0,
      workerStatus: w.workerStatus,
      morningPresent: morning,
      afternoonPresent: afternoon,
      dayValue,
      absentReason: ts?.absentReason ?? null,
      note: ts?.note ?? null,
      saved: Boolean(ts),
    };
  });

  workerRows.sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));

  return NextResponse.json({
    project,
    date: dateStr,
    weekKey: weekKeyForDate(date),
    orders: orders.map((o) => ({
      id: o.id,
      groupNo: o.groupNo,
      workItem: o.workItem,
      unit: o.unit,
      unitPrice: Number(o.unitPrice),
      targetQty: Number(o.targetQty),
      workerCount: o.workers.length,
      workerIds: o.workers.map((w) => w.workerId),
      qcChecklist: parseQcChecklist(o.budgetItem.qcChecklist),
      output: o.output
        ? {
            id: o.output.id,
            actualQty: Number(o.output.actualQty),
            approvedQty: o.output.approvedQty == null ? null : Number(o.output.approvedQty),
            qcStatus: o.output.qcStatus,
            note: o.output.note,
            photos: o.output.photos.map((p) => ({ id: p.id, storageKey: p.storageKey, sortRank: p.sortRank })),
            qcChecks: o.output.qcChecks.map((c) => ({
              id: c.id,
              itemIndex: c.itemIndex,
              itemTitle: c.itemTitle,
              status: c.status,
              hasPhoto: Boolean(c.photoKey),
              note: c.note,
              checkedAt: c.checkedAt,
            })),
          }
        : null,
    })),
    workers: workerRows,
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditEod({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });

  const { date: dateStr, timesheets, outputs } = parsed.data;
  const date = atUtcDate(dateStr);
  const weekKey = weekKeyForDate(date);

  // Validate worker thuộc project
  const workerIds = timesheets.map((t) => t.workerId);
  if (workerIds.length > 0) {
    const valid = await prisma.worker.count({
      where: { id: { in: workerIds }, projectId: params.id },
    });
    if (valid !== workerIds.length) {
      return NextResponse.json({ message: "Có thợ không thuộc công trình" }, { status: 400 });
    }
  }

  // Validate work order thuộc project + đúng ngày
  const woIds = outputs.map((o) => o.workOrderId);
  if (woIds.length > 0) {
    const validOrders = await prisma.workOrder.count({
      where: { id: { in: woIds }, projectId: params.id, date },
    });
    if (validOrders !== woIds.length) {
      return NextResponse.json({ message: "Có phiếu giao việc không thuộc ngày hoặc công trình" }, { status: 400 });
    }
  }

  // Validate: dayValue = 0 phải có absentReason
  for (const t of timesheets) {
    if (t.dayValue === 0 && !t.absentReason) {
      return NextResponse.json({ message: "Thợ vắng (0 công) phải chọn lý do" }, { status: 400 });
    }
  }

  let savedTimesheets = 0;
  let savedOutputs = 0;

  await prisma.$transaction(async (tx) => {
    for (const t of timesheets) {
      await tx.workerTimesheet.upsert({
        where: { workerId_date: { workerId: t.workerId, date } },
        create: {
          projectId: params.id,
          workerId: t.workerId,
          date,
          dayValue: new Prisma.Decimal(t.dayValue),
          absentReason: t.absentReason ?? null,
          weekKey,
          note: t.note ?? null,
          createdById: user.id,
        },
        update: {
          dayValue: new Prisma.Decimal(t.dayValue),
          absentReason: t.absentReason ?? null,
          note: t.note ?? null,
        },
      });
      savedTimesheets += 1;
    }
    for (const o of outputs) {
      await tx.workOrderOutput.upsert({
        where: { workOrderId: o.workOrderId },
        create: {
          workOrderId: o.workOrderId,
          projectId: params.id,
          date,
          actualQty: new Prisma.Decimal(o.actualQty),
          qcStatus: WorkOrderOutputQcStatus.pending,
          weekKey,
          note: o.note ?? null,
          createdById: user.id,
        },
        update: {
          actualQty: new Prisma.Decimal(o.actualQty),
          note: o.note ?? null,
          // Khi sửa lại sản lượng, đẩy về pending để TPTC duyệt lại
          qcStatus: WorkOrderOutputQcStatus.pending,
          approvedQty: null,
          approvedById: null,
          approvedAt: null,
        },
      });
      savedOutputs += 1;
    }
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "worker_timesheet",
    action: "upsert",
    summary: `Cập nhật cuối ngày ${dateStr}: ${savedTimesheets} chấm công + ${savedOutputs} sản lượng`,
    metadata: { date: dateStr, weekKey, timesheets: savedTimesheets, outputs: savedOutputs },
  });

  return NextResponse.json({ ok: true, savedTimesheets, savedOutputs, weekKey });
}
