import { AssignmentPriority, TptcAssignmentStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { fireAndForget, notifyTptcAssignment } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getReportDateVn, upsertPendingTptcAssignmentsForDay } from "@/lib/reports-v3";

const querySchema = z.object({
  ksId: z.string().uuid().optional(),
  status: z.nativeEnum(TptcAssignmentStatus).optional(),
});

const createSchema = z.object({
  projectId: z.string().uuid("projectId không hợp lệ"),
  assignedToUserId: z.string().uuid("assignedToUserId không hợp lệ"),
  title: z.string().trim().min(1, "Tiêu đề là bắt buộc"),
  description: z.string().trim().min(1, "Mô tả là bắt buộc"),
  priority: z.nativeEnum(AssignmentPriority).default(AssignmentPriority.normal),
  dueAt: z.coerce.date(),
});

function isTptcRole(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor?.id || !actor.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!isTptcRole(actor.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    ksId: searchParams.get("ksId") || undefined,
    status: searchParams.get("status") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Query không hợp lệ" }, { status: 400 });
  }

  const rows = await prisma.tptcAssignment.findMany({
    where: {
      ...(parsed.data.ksId ? { assignedToUserId: parsed.data.ksId } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    include: {
      project: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      assignee: {
        select: {
          id: true,
          fullName: true,
        },
      },
      assigner: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    rows,
  });
}

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor?.id || !actor.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!isTptcRole(actor.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const assignee = await prisma.user.findUnique({
    where: { id: parsed.data.assignedToUserId },
    select: { id: true, role: true, isActive: true },
  });

  if (!assignee || assignee.role !== UserRole.engineer || !assignee.isActive) {
    return NextResponse.json({ message: "KS nhận việc không hợp lệ" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  const created = await prisma.tptcAssignment.create({
    data: {
      projectId: parsed.data.projectId,
      assignedToUserId: parsed.data.assignedToUserId,
      assignedByUserId: actor.id,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      dueAt: parsed.data.dueAt,
      status: TptcAssignmentStatus.pending,
    },
  });

  await upsertPendingTptcAssignmentsForDay({
    ksUserId: created.assignedToUserId,
    reportDate: getReportDateVn(),
  });

  fireAndForget(
    notifyTptcAssignment({
      projectId: created.projectId,
      assignmentId: created.id,
      assigneeUserId: created.assignedToUserId,
      actorUserId: actor.id,
      actorName: actor.name ?? "TPTC",
      title: created.title,
      priority: created.priority,
      dueAt: created.dueAt,
    }),
  );

  return NextResponse.json({
    message: "Đã giao việc TPTC",
    assignment: created,
  });
}
