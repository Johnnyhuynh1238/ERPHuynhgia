import { NextResponse } from "next/server";
import { TaskCategory, TaskPhase, TaskStatus, UserRole, type Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { LEGACY_PHASE_META, resolveProjectPhaseIdForTaskPhase } from "@/lib/project-phase";
import { logProjectActivity } from "@/lib/project-activity-log";

const createCustomTaskSchema = z
  .object({
    name: z.string().trim().min(3, "Tên task tối thiểu 3 ký tự"),
    phase: z.nativeEnum(TaskPhase).optional(),
    phaseId: z.string().uuid().optional(),
    durationDays: z.number().int().min(1, "Số ngày phải >= 1"),
    offsetDays: z.number().int().min(0).optional(),
    team: z.string().trim().optional(),
    inspectorName: z.string().trim().min(1, "Người nghiệm thu là bắt buộc"),
    materialsNeeded: z.string().trim().optional(),
    proposerRole: z.string().trim().min(1, "Ai đề xuất là bắt buộc"),
    ordererRole: z.string().trim().min(1, "Ai đặt hàng là bắt buộc"),
    receiverRole: z.string().trim().min(1, "Ai nhận là bắt buộc"),
    isMilestone: z.boolean().optional().default(false),
    visibleToCustomer: z.boolean().optional(),
    category: z.nativeEnum(TaskCategory).optional(),
  })
  .refine((data) => Boolean(data.phaseId || data.phase), {
    message: "Vui lòng chọn phase",
    path: ["phaseId"],
  });

const LEGACY_PHASE_BY_ORDER: Record<number, TaskPhase> = {
  1: TaskPhase.P1_CHUAN_BI,
  2: TaskPhase.P2_MONG,
  3: TaskPhase.P3_KHUNG_TRET,
  4: TaskPhase.P4_KHUNG_LAU,
  5: TaskPhase.P5_ME_XAY_TO,
  6: TaskPhase.P6_OP_LAT,
  7: TaskPhase.P7_SON_BA,
  8: TaskPhase.P8_LAP_TB,
  9: TaskPhase.P9_BAN_GIAO,
};

function deriveLegacyPhase(displayOrder: number): TaskPhase {
  return LEGACY_PHASE_BY_ORDER[displayOrder] || TaskPhase.P9_BAN_GIAO;
}

function addDays(baseDate: Date, offsetDays: number) {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

async function buildCustomCode(tx: Prisma.TransactionClient, projectId: string) {
  const year = new Date().getUTCFullYear();
  const prefix = `TUY-${year}-`;

  const rows = await tx.task.findMany({
    where: {
      projectId,
      origin: "custom",
      code: { startsWith: prefix },
    },
    select: { code: true },
  });

  let maxNo = 0;
  rows.forEach((row) => {
    const match = row.code.match(new RegExp(`^TUY-${year}-(\\d{3})$`));
    if (!match) return;
    const no = Number(match[1]);
    if (no > maxNo) maxNo = no;
  });

  return `TUY-${year}-${String(maxNo + 1).padStart(3, "0")}`;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.construction_manager) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: {
      id: true,
      startDate: true,
      mainEngineerId: true,
    },
  });

  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createCustomTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;

  const maxDisplayOrder = await prisma.task.aggregate({
    where: {
      projectId: params.id,
      isActive: true,
    },
    _max: {
      displayOrder: true,
    },
  });

  let resolvedLegacyPhase: TaskPhase | null = null;
  let resolvedPhaseId: string | null = null;

  if (payload.phaseId) {
    const projectPhase = await prisma.projectPhase.findFirst({
      where: { id: payload.phaseId, projectId: params.id },
      select: { id: true, displayOrder: true },
    });
    if (!projectPhase) {
      return NextResponse.json({ message: "Phase không thuộc dự án này" }, { status: 400 });
    }
    resolvedPhaseId = projectPhase.id;
    resolvedLegacyPhase = deriveLegacyPhase(projectPhase.displayOrder);
  } else if (payload.phase) {
    resolvedLegacyPhase = payload.phase;
  }

  if (!resolvedLegacyPhase) {
    return NextResponse.json({ message: "Phase không hợp lệ" }, { status: 400 });
  }

  const legacyPhase = resolvedLegacyPhase;
  const phaseMeta = LEGACY_PHASE_META[legacyPhase];

  const created = await prisma.$transaction(async (tx) => {
    const code = await buildCustomCode(tx, params.id);
    const targetPhaseId =
      resolvedPhaseId || (await resolveProjectPhaseIdForTaskPhase(tx, params.id, legacyPhase, phaseMeta?.code));
    const offsetDays = payload.offsetDays ?? 0;
    const plannedStartDate = addDays(project.startDate, offsetDays);
    const plannedEndDate = addDays(plannedStartDate, payload.durationDays - 1);

    const task = await tx.task.create({
      data: {
        projectId: params.id,
        templateId: null,
        phaseId: targetPhaseId,
        code,
        phase: legacyPhase,
        name: payload.name,
        origin: "custom",
        category: payload.category || TaskCategory.normal,
        offsetDays,
        durationDays: payload.durationDays,
        duration: payload.durationDays,
        plannedStartDate,
        plannedEndDate,
        actualStartDate: null,
        actualEndDate: null,
        progressPercent: 0,
        progressUpdatedAt: null,
        qcCompletedAt: null,
        assignedEngineerId: project.mainEngineerId,
        assignedForemanId: null,
        team: payload.team || null,
        inspectorName: payload.inspectorName,
        materialsNeeded: payload.materialsNeeded || "Task tùy ý",
        proposerRole: payload.proposerRole,
        ordererRole: payload.ordererRole,
        receiverRole: payload.receiverRole,
        qcChecklist: "",
        isMilestone: payload.isMilestone,
        visibleToCustomer: payload.visibleToCustomer ?? payload.isMilestone,
        status: TaskStatus.not_started,
        isActive: true,
        displayOrder: (maxDisplayOrder._max.displayOrder || 0) + 100,
      },
    });

    await tx.taskActivityLog.create({
      data: {
        taskId: task.id,
        userId: user.id,
        type: "task_created",
        fromValue: null,
        toValue: "custom",
        metadata: {
          code,
        },
        description: "Thêm task tùy ý",
      },
    });

    await tx.taskLog.create({
      data: {
        taskId: task.id,
        userId: user.id,
        logType: "note",
        content: "Đã thêm task tùy ý",
      },
    });

    await logProjectActivity(tx, {
      projectId: params.id,
      actorId: user.id,
      entity: "task",
      entityId: task.id,
      action: "create",
      summary: `Thêm task tùy ý ${task.code} "${task.name}" (giai đoạn ${task.phase}, ${task.durationDays} ngày)`,
      metadata: {
        code: task.code,
        phase: task.phase,
        durationDays: task.durationDays,
        origin: "custom",
        category: task.category,
        isMilestone: task.isMilestone,
      },
    });

    return task;
  });

  return NextResponse.json({
    task: created,
    message: "Đã thêm task tùy ý",
  });
}
