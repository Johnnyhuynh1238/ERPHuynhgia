import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { TaskPhase, TaskStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { LEGACY_PHASE_META, resolveProjectPhaseIdForTaskPhase } from "@/lib/project-phase";
import { getTodayDateVn } from "@/lib/task-centric";
import { logProjectActivity } from "@/lib/project-activity-log";

const createTaskSchema = z.object({
  insertAfterTaskId: z.string().uuid("Task chèn sau không hợp lệ"),
  name: z.string().trim().min(3, "Tên task tối thiểu 3 ký tự"),
  phase: z.nativeEnum(TaskPhase),
  durationDays: z.number().int().min(1, "Số ngày phải >= 1"),
  team: z.string().trim().optional(),
  inspectorName: z.string().trim().min(1, "Người nghiệm thu là bắt buộc"),
  materialsNeeded: z.string().trim().min(1, "Vật tư là bắt buộc"),
  proposerRole: z.string().trim().min(1, "Ai đề xuất là bắt buộc"),
  ordererRole: z.string().trim().min(1, "Ai đặt hàng là bắt buộc"),
  receiverRole: z.string().trim().min(1, "Ai nhận & kiểm là bắt buộc"),
  qcChecklist: z.string().trim().min(1, "Checklist QC là bắt buộc"),
  isMilestone: z.boolean().optional().default(false),
  visibleToCustomer: z.boolean().optional(),
});

function mapPhase(value: string | null): TaskPhase | null {
  if (!value || value === "all") return null;
  if (Object.values(TaskPhase).includes(value as TaskPhase)) return value as TaskPhase;
  return null;
}

function mapStatus(value: string | null): TaskStatus | null {
  if (!value || value === "all") return null;
  if (Object.values(TaskStatus).includes(value as TaskStatus)) return value as TaskStatus;
  return null;
}

function parsePhaseNumber(phase: TaskPhase) {
  const m = phase.match(/^P(\d+)_/);
  return m ? Number(m[1]) : 0;
}

function addDays(baseDate: Date, offsetDays: number) {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

function nextTaskCodeInPhase(existingCodes: string[], phaseNo: number) {
  const base = `${phaseNo}.9`;
  let maxSuffix = 0;
  existingCodes.forEach((code) => {
    const m = code.match(new RegExp(`^${phaseNo}\\.9(\\d+)$`));
    if (m) {
      const suffix = Number(m[1]);
      if (suffix > maxSuffix) maxSuffix = suffix;
    }
  });
  return `${base}${maxSuffix + 1}`;
}

async function normalizeDisplayOrder(tx: Prisma.TransactionClient, projectId: string) {
  const ordered = await tx.task.findMany({
    where: { projectId, isActive: true },
    select: { id: true },
    orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
  });

  await Promise.all(
    ordered.map((task, idx) =>
      tx.task.update({
        where: { id: task.id },
        data: { displayOrder: (idx + 1) * 100 },
      }),
    ),
  );
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: {
      id: true,
      projectManagerId: true,
      mainEngineerId: true,
      code: true,
      name: true,
      startDate: true,
    },
  });

  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const phase = mapPhase(searchParams.get("phase"));
  const status = mapStatus(searchParams.get("status"));
  const engineerId = searchParams.get("engineerId") || "";
  const search = (searchParams.get("search") || "").trim();
  const includeDeleted = searchParams.get("includeDeleted") === "1";
  const todayCheckin = searchParams.get("todayCheckin") === "1";

  const isAdminLike =
    user.role === UserRole.admin ||
    user.role === UserRole.accountant ||
    user.role === UserRole.construction_manager;
  const isProjectOwner = user.id === project.projectManagerId || user.id === project.mainEngineerId;

  let roleFilter: Prisma.TaskWhereInput = {};
  if (!isAdminLike && !isProjectOwner) {
    if (user.role === UserRole.foreman) {
      roleFilter = { assignedForemanId: user.id };
    } else {
      roleFilter = { assignedEngineerId: user.id };
    }
  }

  const tasks = await prisma.task.findMany({
    where: {
      projectId: params.id,
      ...(includeDeleted ? {} : { isActive: true }),
      ...(phase ? { phase } : {}),
      ...(status ? { status } : {}),
      ...(engineerId ? { assignedEngineerId: engineerId } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(todayCheckin
        ? {
            morningCheckinTasks: {
              some: {
                checkin: {
                  reportDate: getTodayDateVn(),
                  projectId: params.id,
                },
              },
            },
          }
        : {}),
      ...roleFilter,
    },
    include: {
      projectPhase: {
        select: {
          id: true,
          code: true,
          name: true,
          displayOrder: true,
          duration: true,
          plannedStartDate: true,
          plannedEndDate: true,
          actualStartDate: true,
          actualEndDate: true,
          status: true,
        },
      },
      assignedEngineer: {
        select: { id: true, fullName: true },
      },
      assignedForeman: {
        select: { id: true, fullName: true },
      },
    },
    orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
  });

  const [engineers, phases] = await Promise.all([
    prisma.user.findMany({
      where: { role: UserRole.engineer, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.projectPhase.findMany({
      where: { projectId: params.id },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        displayOrder: true,
        duration: true,
        plannedStartDate: true,
        plannedEndDate: true,
        actualStartDate: true,
        actualEndDate: true,
        status: true,
      },
    }),
  ]);

  return NextResponse.json({
    project,
    tasks,
    phases,
    engineers,
    role: user.role,
  });
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
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;

  try {
    const createdTask = await prisma.$transaction(async (tx) => {
      const afterTask = await tx.task.findFirst({
        where: {
          id: payload.insertAfterTaskId,
          projectId: params.id,
          isActive: true,
        },
        select: {
          id: true,
          templateId: true,
          phase: true,
          offsetDays: true,
          durationDays: true,
          displayOrder: true,
        },
      });

      if (!afterTask) {
        throw new Error("Task chèn sau không hợp lệ");
      }

      const phase = payload.phase;
      const phaseNo = parsePhaseNumber(phase);
      const phaseMeta = LEGACY_PHASE_META[phase];

      const sameProjectCodes = await tx.task.findMany({
        where: { projectId: params.id },
        select: { code: true },
      });
      const code = nextTaskCodeInPhase(
        sameProjectCodes.map((x) => x.code),
        phaseNo,
      );

      const sortedActive = await tx.task.findMany({
        where: { projectId: params.id, isActive: true },
        select: { id: true, displayOrder: true },
        orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
      });

      const idx = sortedActive.findIndex((t) => t.id === afterTask.id);
      const next = idx >= 0 && idx + 1 < sortedActive.length ? sortedActive[idx + 1] : null;

      const currentOrder = afterTask.displayOrder ?? 100;
      const nextOrder = next?.displayOrder ?? currentOrder + 200;
      let displayOrder = Math.floor((currentOrder + nextOrder) / 2);

      if (displayOrder <= currentOrder || displayOrder >= nextOrder) {
        await normalizeDisplayOrder(tx, params.id);
        const refreshed = await tx.task.findMany({
          where: { projectId: params.id, isActive: true },
          select: { id: true, displayOrder: true },
          orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
        });
        const refreshedIdx = refreshed.findIndex((t) => t.id === afterTask.id);
        const refreshedCurrent = refreshed[refreshedIdx]?.displayOrder ?? 100;
        const refreshedNextRaw =
          refreshedIdx >= 0 && refreshedIdx + 1 < refreshed.length
            ? refreshed[refreshedIdx + 1].displayOrder
            : refreshedCurrent + 200;
        const refreshedNext = refreshedNextRaw ?? refreshedCurrent + 200;
        displayOrder = Math.floor((refreshedCurrent + refreshedNext) / 2);
      }

      const targetPhaseId = await resolveProjectPhaseIdForTaskPhase(tx, params.id, phase, phaseMeta.code);

      const offsetDays = afterTask.offsetDays + afterTask.durationDays;
      const plannedStartDate = addDays(project.startDate, offsetDays);
      const plannedEndDate = addDays(plannedStartDate, payload.durationDays - 1);

      const task = await tx.task.create({
        data: {
          projectId: params.id,
          templateId: afterTask.templateId,
          phaseId: targetPhaseId,
          code,
          phase,
          name: payload.name,
          offsetDays,
          durationDays: payload.durationDays,
          duration: payload.durationDays,
          plannedStartDate,
          plannedEndDate,
          actualStartDate: null,
          actualEndDate: null,
          assignedEngineerId: project.mainEngineerId,
          assignedForemanId: null,
          team: payload.team || null,
          inspectorName: payload.inspectorName,
          materialsNeeded: payload.materialsNeeded,
          proposerRole: payload.proposerRole,
          ordererRole: payload.ordererRole,
          receiverRole: payload.receiverRole,
          qcChecklist: payload.qcChecklist,
          isMilestone: payload.isMilestone || false,
          status: TaskStatus.not_started,
          isActive: true,
          visibleToCustomer: payload.visibleToCustomer ?? payload.isMilestone ?? false,
          displayOrder,
          notes: null,
        },
      });

      await tx.taskLog.create({
        data: {
          taskId: task.id,
          userId: user.id,
          logType: "note",
          content: "Đã thêm task mới vào dự án",
        },
      });

      await logProjectActivity(tx, {
        projectId: params.id,
        actorId: user.id,
        entity: "task",
        entityId: task.id,
        action: "create",
        summary: `Thêm task ${task.code} "${task.name}" (giai đoạn ${task.phase}, ${task.durationDays} ngày)`,
        metadata: {
          code: task.code,
          phase: task.phase,
          durationDays: task.durationDays,
          insertAfterTaskId: payload.insertAfterTaskId,
        },
      });

      return task;
    });

    return NextResponse.json({ task: createdTask, message: "Đã thêm task mới" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể thêm task";
    return NextResponse.json({ message }, { status: 400 });
  }
}
