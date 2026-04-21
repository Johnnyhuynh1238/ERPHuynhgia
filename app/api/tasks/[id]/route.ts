import { NextResponse } from "next/server";
import { TaskLogType, TaskPhase, TaskStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import {
  canChangeStatus,
  canEditActualDates,
  canInspectTask,
  canUpdateQc,
  getTaskWithAccess,
} from "@/lib/task-permissions";

const patchSchema = z.object({
  section: z.enum(["status", "dates", "assignment", "qc", "meta"]),
  payload: z.record(z.string(), z.any()),
});

const statusSchema = z.object({
  status: z.nativeEnum(TaskStatus),
  notes: z.string().optional(),
  note: z.string().optional(),
});

const datesSchema = z.object({
  actualStartDate: z.string().nullable().optional(),
  actualEndDate: z.string().nullable().optional(),
});

const assignmentSchema = z.object({
  assignedEngineerId: z.string().uuid().nullable().optional(),
  assignedForemanId: z.string().uuid().nullable().optional(),
  team: z.string().optional(),
  inspectorName: z.string().min(1).optional(),
});

const qcSchema = z.object({
  checkedIndexes: z.array(z.number()),
});

const metaSchema = z.object({
  name: z.string().trim().min(3).optional(),
  phase: z.nativeEnum(TaskPhase).optional(),
  offsetDays: z.number().int().min(0).optional(),
  durationDays: z.number().int().min(1).optional(),
  team: z.string().trim().nullable().optional(),
  inspectorName: z.string().trim().min(1).optional(),
  materialsNeeded: z.string().trim().min(1).optional(),
  qcChecklist: z.string().trim().min(1).optional(),
  isMilestone: z.boolean().optional(),
  proposerRole: z.string().trim().min(1).optional(),
  ordererRole: z.string().trim().min(1).optional(),
  receiverRole: z.string().trim().min(1).optional(),
});

function normalizeDate(raw: string | null | undefined) {
  if (!raw) return null;
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function addDays(baseDate: Date, offsetDays: number) {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const [taskDetail, logs, photos, engineers, foremen] = await Promise.all([
    prisma.task.findUnique({
      where: { id: params.id },
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            mainEngineerId: true,
            projectManagerId: true,
          },
        },
        template: {
          select: {
            proposerRole: true,
            ordererRole: true,
            receiverRole: true,
          },
        },
        assignedEngineer: { select: { id: true, fullName: true, email: true } },
        assignedForeman: { select: { id: true, fullName: true, email: true } },
      },
    }),
    prisma.taskLog.findMany({
      where: { taskId: params.id },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.taskPhoto.findMany({
      where: { taskId: params.id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: UserRole.engineer, isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.user.findMany({
      where: { role: UserRole.foreman, isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return NextResponse.json({
    task: taskDetail,
    logs,
    photos,
    engineers,
    foremen,
    canChangeStatus: canChangeStatus(task, { id: user.id, role: user.role }),
    canInspect: canInspectTask(task, { id: user.id, role: user.role }),
    canEditDates: canEditActualDates(task, { id: user.id, role: user.role }),
    canUpdateQc: canUpdateQc(task, { id: user.id, role: user.role }),
    userId: user.id,
    userRole: user.role,
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (parsed.data.section === "status") {
    if (!canChangeStatus(task, { id: user.id, role: user.role })) {
      return NextResponse.json({ message: "Không có quyền đổi trạng thái" }, { status: 403 });
    }

    const payload = statusSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: payload.error.issues[0]?.message || "Trạng thái không hợp lệ" }, { status: 400 });
    }

    if (payload.data.status === TaskStatus.inspected && !canInspectTask(task, { id: user.id, role: user.role })) {
      return NextResponse.json({ message: "Chỉ admin, trưởng phòng thi công hoặc KS chính mới được nghiệm thu" }, { status: 403 });
    }

    const naReason = (payload.data.notes || payload.data.note || "").trim();
    if (payload.data.status === TaskStatus.na && !naReason) {
      return NextResponse.json({ message: "Vui lòng nhập lý do khi chuyển NA" }, { status: 400 });
    }

    const now = new Date();

    const updated = await prisma.task.update({
      where: { id: params.id },
      data: {
        status: payload.data.status,
        actualStartDate:
          payload.data.status === TaskStatus.in_progress && !task.actualStartDate ? now : task.actualStartDate,
        actualEndDate:
          (payload.data.status === TaskStatus.done || payload.data.status === TaskStatus.inspected) && !task.actualEndDate
            ? now
            : task.actualEndDate,
        notes: naReason ? `${task.notes || ""}\n[NA_REASON] ${naReason}`.trim() : task.notes,
      },
    });

    await prisma.taskLog.create({
      data: {
        taskId: task.id,
        userId: user.id,
        logType: TaskLogType.status_change,
        oldValue: task.status,
        newValue: payload.data.status,
        content: `Đổi trạng thái từ ${task.status} -> ${payload.data.status}`,
      },
    });

    return NextResponse.json({ task: updated, message: "Đã cập nhật trạng thái" });
  }

  if (parsed.data.section === "dates") {
    if (!canEditActualDates(task, { id: user.id, role: user.role })) {
      return NextResponse.json({ message: "Không có quyền sửa ngày thực tế" }, { status: 403 });
    }

    const payload = datesSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: "Dữ liệu ngày không hợp lệ" }, { status: 400 });
    }

    const updated = await prisma.task.update({
      where: { id: params.id },
      data: {
        actualStartDate: normalizeDate(payload.data.actualStartDate),
        actualEndDate: normalizeDate(payload.data.actualEndDate),
      },
    });

    return NextResponse.json({ task: updated, message: "Đã cập nhật ngày thực tế" });
  }

  if (parsed.data.section === "assignment") {
    if (user.role !== UserRole.admin && user.role !== UserRole.construction_manager) {
      return NextResponse.json({ message: "Chỉ admin hoặc trưởng phòng thi công được phép sửa phân công" }, { status: 403 });
    }

    const payload = assignmentSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: "Dữ liệu phân công không hợp lệ" }, { status: 400 });
    }

    const updated = await prisma.task.update({
      where: { id: params.id },
      data: {
        assignedEngineerId: payload.data.assignedEngineerId || null,
        assignedForemanId: payload.data.assignedForemanId || null,
        team: payload.data.team ?? task.team,
        inspectorName: payload.data.inspectorName || task.inspectorName,
      },
    });

    await prisma.taskLog.create({
      data: {
        taskId: task.id,
        userId: user.id,
        logType: TaskLogType.assignment_change,
        content: "Cập nhật phân công task",
      },
    });

    return NextResponse.json({ task: updated, message: "Đã cập nhật phân công" });
  }

  if (parsed.data.section === "meta") {
    if (user.role !== UserRole.admin && user.role !== UserRole.construction_manager) {
      return NextResponse.json({ message: "Không có quyền sửa thông tin task" }, { status: 403 });
    }

    const payload = metaSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: payload.error.issues[0]?.message || "Dữ liệu task không hợp lệ" }, { status: 400 });
    }

    const offsetDays = payload.data.offsetDays ?? task.offsetDays;
    const durationDays = payload.data.durationDays ?? task.durationDays;

    const project = await prisma.project.findUnique({
      where: { id: task.projectId },
      select: { id: true, startDate: true },
    });

    if (!project) {
      return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
    }

    const plannedStartDate = addDays(project.startDate, offsetDays);
    const plannedEndDate = addDays(plannedStartDate, durationDays - 1);

    const updated = await prisma.task.update({
      where: { id: params.id },
      data: {
        name: payload.data.name ?? task.name,
        phase: payload.data.phase ?? task.phase,
        offsetDays,
        durationDays,
        plannedStartDate,
        plannedEndDate,
        team: payload.data.team === undefined ? task.team : payload.data.team,
        inspectorName: payload.data.inspectorName ?? task.inspectorName,
        materialsNeeded: payload.data.materialsNeeded ?? task.materialsNeeded,
        qcChecklist: payload.data.qcChecklist ?? task.qcChecklist,
        isMilestone: payload.data.isMilestone ?? task.isMilestone,
        proposerRole: payload.data.proposerRole ?? task.proposerRole,
        ordererRole: payload.data.ordererRole ?? task.ordererRole,
        receiverRole: payload.data.receiverRole ?? task.receiverRole,
      },
    });

    await prisma.taskLog.create({
      data: {
        taskId: task.id,
        userId: user.id,
        logType: TaskLogType.note,
        content: "Đã sửa thông tin task",
      },
    });

    return NextResponse.json({ task: updated, message: "Đã cập nhật thông tin task" });
  }

  const payload = qcSchema.safeParse(parsed.data.payload);
  if (!payload.success) {
    return NextResponse.json({ message: "Dữ liệu checklist không hợp lệ" }, { status: 400 });
  }

  if (!canUpdateQc(task, { id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền cập nhật QC" }, { status: 403 });
  }

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: {
      qcProgress: {
        checkedIndexes: payload.data.checkedIndexes,
      },
    },
  });

  return NextResponse.json({ task: updated, message: "Đã cập nhật checklist" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.construction_manager) {
    return NextResponse.json({ message: "Không có quyền xóa task" }, { status: 403 });
  }

  if (!task.isActive) {
    return NextResponse.json({ message: "Task đã bị xóa trước đó" }, { status: 400 });
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      isActive: false,
      displayOrder: null,
    },
  });

  await prisma.taskLog.create({
    data: {
      taskId: task.id,
      userId: user.id,
      logType: TaskLogType.note,
      content: "Đã xóa task khỏi tiến độ dự án",
    },
  });

  return NextResponse.json({ message: "Đã xóa task" });
}
