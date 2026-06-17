import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

type HistoryEvent = {
  type: "created" | "acknowledged" | "daily_status" | "completed" | "approved" | "rejected" | "cancelled";
  at: string;
  actorName: string | null;
  status?: "working_on_today" | "not_today";
  note?: string | null;
};

function isTptcOrAssignee(role: string, isAssignee: boolean) {
  return role === UserRole.admin || role === UserRole.construction_manager || isAssignee;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser();
  if (!actor?.id || !actor.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const assignment = await prisma.tptcAssignment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      createdAt: true,
      acknowledgedAt: true,
      completedAt: true,
      approvedAt: true,
      status: true,
      reviewNote: true,
      ksNote: true,
      assignedToUserId: true,
      assignedByUserId: true,
      updatedAt: true,
      assigner: { select: { fullName: true } },
      assignee: { select: { fullName: true } },
      dailyStatuses: {
        orderBy: { reportDate: "desc" },
        select: {
          status: true,
          note: true,
          reportDate: true,
          updatedAt: true,
          ksUser: { select: { fullName: true } },
        },
      },
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "Không tìm thấy việc TPTC" }, { status: 404 });
  }

  const isAssignee = assignment.assignedToUserId === actor.id;
  if (!isTptcOrAssignee(actor.role, isAssignee)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const events: HistoryEvent[] = [];

  events.push({
    type: "created",
    at: assignment.createdAt.toISOString(),
    actorName: assignment.assigner?.fullName || null,
  });

  if (assignment.acknowledgedAt) {
    events.push({
      type: "acknowledged",
      at: assignment.acknowledgedAt.toISOString(),
      actorName: assignment.assignee?.fullName || null,
    });
  }

  for (const ds of assignment.dailyStatuses) {
    events.push({
      type: "daily_status",
      at: ds.updatedAt.toISOString(),
      actorName: ds.ksUser?.fullName || null,
      status: ds.status as "working_on_today" | "not_today",
      note: ds.note,
    });
  }

  if (assignment.completedAt) {
    events.push({
      type: "completed",
      at: assignment.completedAt.toISOString(),
      actorName: assignment.assignee?.fullName || null,
      note: assignment.ksNote,
    });
  }

  if (assignment.approvedAt && assignment.status === "approved") {
    events.push({
      type: "approved",
      at: assignment.approvedAt.toISOString(),
      actorName: null,
      note: assignment.reviewNote,
    });
  }

  if (assignment.status === "rejected") {
    events.push({
      type: "rejected",
      at: assignment.updatedAt.toISOString(),
      actorName: null,
      note: assignment.reviewNote,
    });
  }

  if (assignment.status === "cancelled") {
    events.push({
      type: "cancelled",
      at: assignment.updatedAt.toISOString(),
      actorName: null,
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return NextResponse.json({
    assignment: {
      id: assignment.id,
      title: assignment.title,
    },
    events,
  });
}
