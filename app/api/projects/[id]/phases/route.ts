import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { addDaysUtc, recalcProjectPhasesTimeline } from "@/lib/project-phase";
import { logProjectActivity } from "@/lib/project-activity-log";

const createPhaseSchema = z.object({
  name: z.string().trim().min(1, "Tên phase là bắt buộc"),
  duration: z.number().int().min(1, "Số ngày phải >= 1"),
  displayOrder: z.number().int().min(1).optional(),
  description: z.string().trim().optional().nullable(),
});

function canManagePhase(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

async function resequencePhaseCodes(tx: Prisma.TransactionClient, projectId: string) {
  const phases = await tx.projectPhase.findMany({
    where: { projectId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  await Promise.all(
    phases.map((phase, index) =>
      tx.projectPhase.update({
        where: { id: phase.id },
        data: {
          code: `P${index + 1}`,
          displayOrder: index + 1,
        },
      }),
    ),
  );
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
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
      code: true,
      name: true,
      startDate: true,
      plannedDeadline: true,
    },
  });

  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const phases = await prisma.projectPhase.findMany({
    where: { projectId: params.id },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
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
    },
  });

  return NextResponse.json({
    project,
    phases,
    canManage: canManagePhase(user.role),
    canDelete: user.role === UserRole.admin,
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!canManagePhase(user.role)) {
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
    },
  });

  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createPhaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;

  const phase = await prisma.$transaction(async (tx) => {
    const phases = await tx.projectPhase.findMany({
      where: { projectId: params.id },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, displayOrder: true },
    });

    const maxOrder = phases.length + 1;
    const insertOrder = Math.max(1, Math.min(payload.displayOrder ?? maxOrder, maxOrder));

    const phasesToShift = phases
      .filter((item) => item.displayOrder >= insertOrder)
      .sort((a, b) => b.displayOrder - a.displayOrder);

    for (const item of phasesToShift) {
      await tx.projectPhase.update({
        where: { id: item.id },
        data: { displayOrder: item.displayOrder + 1 },
      });
    }

    const created = await tx.projectPhase.create({
      data: {
        projectId: params.id,
        code: `P${insertOrder}`,
        name: payload.name,
        description: payload.description || null,
        displayOrder: insertOrder,
        duration: payload.duration,
        plannedStartDate: addDaysUtc(project.startDate, 0),
        plannedEndDate: addDaysUtc(project.startDate, payload.duration - 1),
        actualStartDate: null,
        actualEndDate: null,
        status: "not_started",
        createdBy: user.id,
      },
    });

    await recalcProjectPhasesTimeline(tx, params.id);
    await resequencePhaseCodes(tx, params.id);

    await logProjectActivity(tx, {
      projectId: params.id,
      actorId: user.id,
      entity: "project_phase",
      entityId: created.id,
      action: "create",
      summary: `Thêm phase "${created.name}" (${payload.duration} ngày)`,
      metadata: { name: created.name, duration: payload.duration, displayOrder: insertOrder },
    });

    return created;
  });

  return NextResponse.json({ phase, message: "Đã thêm phase" });
}
