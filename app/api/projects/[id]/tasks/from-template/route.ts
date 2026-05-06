import { NextResponse } from "next/server";
import { TaskStatus, UserRole, type Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { resolveProjectPhaseIdForTaskPhase } from "@/lib/project-phase";

const createFromTemplateSchema = z.object({
  templateId: z.string().uuid("Template không hợp lệ"),
  phaseId: z.string().uuid().optional().nullable(),
  visibleToCustomer: z.boolean().optional(),
});

function addDays(baseDate: Date, offsetDays: number) {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

async function resolveUniqueCode(tx: Prisma.TransactionClient, projectId: string, baseCode: string) {
  const existed = await tx.task.findFirst({
    where: {
      projectId,
      code: baseCode,
    },
    select: { id: true },
  });

  if (!existed) return baseCode;

  const withPrefix = await tx.task.findMany({
    where: {
      projectId,
      code: { startsWith: `${baseCode}-` },
    },
    select: { code: true },
  });

  let max = 1;
  withPrefix.forEach((row) => {
    const match = row.code.match(new RegExp(`^${baseCode}-(\\d+)$`));
    if (!match) return;
    const num = Number(match[1]);
    if (num > max) max = num;
  });

  return `${baseCode}-${max + 1}`;
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
  const parsed = createFromTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const template = await prisma.taskTemplate.findUnique({
    where: { id: parsed.data.templateId },
    include: {
      qcTemplate: {
        include: {
          qcItems: {
            orderBy: { displayOrder: "asc" },
          },
        },
      },
    },
  });

  if (!template || !template.isActive) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  const maxDisplayOrder = await prisma.task.aggregate({
    where: { projectId: params.id, isActive: true },
    _max: { displayOrder: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    const code = await resolveUniqueCode(tx, params.id, template.code);
    const targetPhaseId = parsed.data.phaseId
      ? (await tx.projectPhase.findFirst({ where: { id: parsed.data.phaseId, projectId: params.id }, select: { id: true } }))?.id || null
      : await resolveProjectPhaseIdForTaskPhase(tx, params.id, template.phase, template.phaseCode);

    const plannedStartDate = addDays(project.startDate, template.defaultOffsetDays);
    const durationDays = Math.max(template.defaultDurationDays || template.duration || 1, 1);
    const plannedEndDate = addDays(plannedStartDate, durationDays - 1);

    const task = await tx.task.create({
      data: {
        projectId: params.id,
        templateId: template.id,
        phaseId: targetPhaseId,
        code,
        phase: template.phase,
        name: template.name,
        origin: "template",
        category: template.category,
        offsetDays: template.defaultOffsetDays,
        durationDays,
        duration: durationDays,
        plannedStartDate,
        plannedEndDate,
        actualStartDate: null,
        actualEndDate: null,
        progressPercent: 0,
        progressUpdatedAt: null,
        qcCompletedAt: null,
        assignedEngineerId: project.mainEngineerId,
        assignedForemanId: null,
        team: template.defaultTeam || null,
        inspectorName: template.defaultInspector || "",
        materialsNeeded: template.materialsNeeded,
        proposerRole: template.proposerRole,
        ordererRole: template.ordererRole,
        receiverRole: template.receiverRole,
        qcChecklist: template.qcChecklist,
        isMilestone: template.isMilestone,
        visibleToCustomer: parsed.data.visibleToCustomer ?? template.isMilestone,
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
        toValue: "template",
        metadata: {
          templateId: template.id,
          templateCode: template.code,
        },
        description: "Thêm task từ thư viện chuẩn",
      },
    });

    await tx.taskLog.create({
      data: {
        taskId: task.id,
        userId: user.id,
        logType: "note",
        content: "Đã thêm task từ thư viện chuẩn",
      },
    });

    return task;
  });

  return NextResponse.json({
    task: created,
    message: "Đã thêm task từ thư viện",
  });
}
