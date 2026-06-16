import { TptcAssignmentStatus, TptcDailyStatusKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  status: z.enum(["working_on_today", "not_today"]),
  note: z.string().trim().max(500).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function parseDateOrToday(input?: string) {
  if (input) {
    return new Date(`${input}T00:00:00.000Z`);
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser();
  if (!actor?.id) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const assignment = await prisma.tptcAssignment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      assignedToUserId: true,
    },
  });

  if (!assignment) {
    return NextResponse.json({ message: "Không tìm thấy việc TPTC" }, { status: 404 });
  }

  if (assignment.assignedToUserId !== actor.id) {
    return NextResponse.json({ message: "Chỉ KS được giao mới cập nhật được" }, { status: 403 });
  }

  if (
    assignment.status === TptcAssignmentStatus.done ||
    assignment.status === TptcAssignmentStatus.approved ||
    assignment.status === TptcAssignmentStatus.cancelled
  ) {
    return NextResponse.json({ message: "Việc đã kết thúc, không cần cập nhật" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const reportDate = parseDateOrToday(parsed.data.date);
  const note = parsed.data.note?.trim() || null;

  if (parsed.data.status === "not_today" && !note) {
    return NextResponse.json({ message: "Nhập lý do chưa làm hôm nay" }, { status: 400 });
  }

  const record = await prisma.tptcAssignmentDailyStatus.upsert({
    where: {
      tptcAssignmentId_reportDate: {
        tptcAssignmentId: assignment.id,
        reportDate,
      },
    },
    create: {
      tptcAssignmentId: assignment.id,
      ksUserId: actor.id,
      reportDate,
      status: parsed.data.status as TptcDailyStatusKind,
      note,
    },
    update: {
      status: parsed.data.status as TptcDailyStatusKind,
      note,
      ksUserId: actor.id,
    },
  });

  if (
    parsed.data.status === "working_on_today" &&
    assignment.status === TptcAssignmentStatus.pending
  ) {
    await prisma.tptcAssignment.update({
      where: { id: assignment.id },
      data: { status: TptcAssignmentStatus.in_progress },
    });
  }

  return NextResponse.json({
    message: "Đã cập nhật trạng thái hôm nay",
    dailyStatus: record,
  });
}
