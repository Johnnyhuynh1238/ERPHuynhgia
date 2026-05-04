import { NextResponse } from "next/server";
import { TaskCategory, TaskPhase, TaskStatus, UserRole, type Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { LEGACY_PHASE_META } from "@/lib/project-phase";

const createCustomTaskSchema = z.object({
  name: z.string().trim().min(3, "Tên task tối thiểu 3 ký tự"),
  phase: z.nativeEnum(TaskPhase),
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
});

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
  const phaseMeta = LEGACY_PHASE_META[payload.phase];

  const [targetPhase, maxDisplayOrder] = await Promise.all([
    prisma.projectPhase.findFirst({
      where: {
        projectId: params.id,
        code: phaseMeta.code,
      },
      select: {
        id: true,
      },
    }),
    prisma.task.aggregate({
      where: {
        projectId: params.id,
        isActive: true,
      },
      _max: {
        displayOrder: true,
      },
    }),
  ]);

  const created = await prisma.$transaction(async (tx) => {
    const code = await buildCustomCode(tx, params.id);
    const offsetDays = payload.offsetDays ?? 0;
    const plannedStartDate = addDays(project.startDate, offsetDays);
    const plannedEndDate = addDays(plannedStartDate, payload.durationDays - 1);

    const task = await tx.task.create({
      data: {
        projectId: params.id,
        templateId: null,
        phaseId: targetPhase?.id || null,
        code,
        phase: payload.phase,
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

    return task;
  });

  return NextResponse.json({
    task: created,
    message: "Đã thêm task tùy ý",
  });
}
