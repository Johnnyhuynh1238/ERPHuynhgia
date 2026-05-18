import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { recalcProjectPhasesTimeline } from "@/lib/project-phase";
import { buildDiff, joinSummary, logProjectActivity } from "@/lib/project-activity-log";

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  duration: z.number().int().min(1).optional(),
  displayOrder: z.number().int().min(1).optional(),
  confirmRunningChange: z.boolean().optional(),
});

const deleteSchema = z.object({
  confirmName: z.string().trim().min(1),
});

async function resequenceAfterDelete(tx: Prisma.TransactionClient, projectId: string) {
  const phases = await tx.projectPhase.findMany({
    where: { projectId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  for (let index = 0; index < phases.length; index += 1) {
    await tx.projectPhase.update({
      where: { id: phases[index].id },
      data: {
        displayOrder: index + 1,
        code: `P${index + 1}`,
      },
    });
  }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const phase = await prisma.projectPhase.findUnique({
    where: { id: params.id },
    include: {
      tasks: {
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          plannedStartDate: true,
          plannedEndDate: true,
          actualStartDate: true,
          actualEndDate: true,
        },
        orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
      },
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          projectManagerId: true,
          mainEngineerId: true,
        },
      },
    },
  });

  if (!phase) {
    return NextResponse.json({ message: "Không tìm thấy phase" }, { status: 404 });
  }

  const project = await prisma.project.findFirst({
    where: {
      id: phase.projectId,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  return NextResponse.json({
    phase,
    canManage: user.role === UserRole.admin || user.role === UserRole.construction_manager,
    canDelete: user.role === UserRole.admin,
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.construction_manager) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const phase = await prisma.projectPhase.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      projectId: true,
      name: true,
      status: true,
      duration: true,
      displayOrder: true,
    },
  });

  if (!phase) {
    return NextResponse.json({ message: "Không tìm thấy phase" }, { status: 404 });
  }

  const project = await prisma.project.findFirst({
    where: {
      id: phase.projectId,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const payload = parsed.data;
  if (
    payload.duration !== undefined &&
    payload.duration !== phase.duration &&
    phase.status === "in_progress" &&
    payload.confirmRunningChange !== true
  ) {
    return NextResponse.json(
      { message: "Phase đang chạy. Xác nhận confirmRunningChange=true để đổi duration." },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    let targetOrder = phase.displayOrder;
    if (payload.displayOrder !== undefined) {
      const all = await tx.projectPhase.findMany({
        where: { projectId: phase.projectId },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, displayOrder: true },
      });
      const max = all.length;
      targetOrder = Math.max(1, Math.min(payload.displayOrder, max));

      if (targetOrder !== phase.displayOrder) {
        if (targetOrder < phase.displayOrder) {
          const moving = all
            .filter((p) => p.displayOrder >= targetOrder && p.displayOrder < phase.displayOrder && p.id !== phase.id)
            .sort((a, b) => a.displayOrder - b.displayOrder);
          for (const item of moving) {
            await tx.projectPhase.update({
              where: { id: item.id },
              data: { displayOrder: item.displayOrder + 1 },
            });
          }
        } else {
          const moving = all
            .filter((p) => p.displayOrder > phase.displayOrder && p.displayOrder <= targetOrder && p.id !== phase.id)
            .sort((a, b) => b.displayOrder - a.displayOrder);
          for (const item of moving) {
            await tx.projectPhase.update({
              where: { id: item.id },
              data: { displayOrder: item.displayOrder - 1 },
            });
          }
        }
      }
    }

    await tx.projectPhase.update({
      where: { id: phase.id },
      data: {
        name: payload.name ?? phase.name,
        description: payload.description === undefined ? undefined : payload.description,
        duration: payload.duration ?? phase.duration,
        displayOrder: targetOrder,
      },
    });

    await resequenceAfterDelete(tx, phase.projectId);
    await recalcProjectPhasesTimeline(tx, phase.projectId);

    const after = await tx.projectPhase.findUnique({ where: { id: phase.id }, select: { name: true, duration: true, displayOrder: true } });
    const { diff, lines } = buildDiff(
      { name: phase.name, duration: phase.duration, displayOrder: phase.displayOrder },
      { name: after?.name, duration: after?.duration, displayOrder: after?.displayOrder },
      [
        { key: "name", label: "Tên" },
        { key: "duration", label: "Số ngày" },
        { key: "displayOrder", label: "Thứ tự" },
      ],
    );
    if (Object.keys(diff).length > 0) {
      await logProjectActivity(tx, {
        projectId: phase.projectId,
        actorId: user.id,
        entity: "project_phase",
        entityId: phase.id,
        action: "update",
        summary: joinSummary(`Sửa phase "${phase.name}"`, lines, `Cập nhật phase "${phase.name}"`),
        diff,
      });
    }
  });

  const updated = await prisma.projectPhase.findUnique({ where: { id: params.id } });

  return NextResponse.json({ phase: updated, message: "Đã cập nhật phase" });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được xóa phase" }, { status: 403 });
  }

  const phase = await prisma.projectPhase.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      projectId: true,
      name: true,
      displayOrder: true,
      tasks: {
        where: { isActive: true },
        select: { id: true },
      },
    },
  });

  if (!phase) {
    return NextResponse.json({ message: "Không tìm thấy phase" }, { status: 404 });
  }

  const project = await prisma.project.findFirst({
    where: {
      id: phase.projectId,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success || parsed.data.confirmName !== phase.name) {
    return NextResponse.json({ message: "Tên phase xác nhận không khớp" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    if (phase.tasks.length > 0) {
      await tx.task.updateMany({
        where: {
          phaseId: phase.id,
          isActive: true,
        },
        data: {
          isActive: false,
          displayOrder: null,
        },
      });
    }

    await tx.projectPhase.delete({ where: { id: phase.id } });
    await resequenceAfterDelete(tx, phase.projectId);
    await recalcProjectPhasesTimeline(tx, phase.projectId);

    await logProjectActivity(tx, {
      projectId: phase.projectId,
      actorId: user.id,
      entity: "project_phase",
      entityId: phase.id,
      action: "delete",
      summary: `Xóa phase "${phase.name}" (${phase.tasks.length} task bị tắt theo)`,
      snapshot: phase,
    });
  });

  return NextResponse.json({ message: "Đã xóa phase" });
}
