import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canManageShifts } from "@/lib/shifts";

const upsertSchema = z.object({
  userId: z.string().uuid("userId không hợp lệ"),
  daysOfWeek: z
    .array(z.number().int().min(1).max(7))
    .min(1, "Phải chọn ít nhất 1 ngày trong tuần")
    .max(7),
  isActive: z.boolean().optional(),
});

const deleteSchema = z.object({
  userId: z.string().uuid("userId không hợp lệ"),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !canManageShifts(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const shift = await prisma.shift.findUnique({ where: { id: params.id } });
  if (!shift) {
    return NextResponse.json({ message: "Không tìm thấy ca" }, { status: 404 });
  }

  const assignments = await prisma.userShiftAssignment.findMany({
    where: { shiftId: params.id },
    include: {
      user: { select: { id: true, fullName: true, email: true, role: true, isActive: true } },
    },
    orderBy: [{ user: { role: "asc" } }, { user: { fullName: "asc" } }],
  });

  return NextResponse.json({
    shift: {
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      graceMinutes: shift.graceMinutes,
      isActive: shift.isActive,
      note: shift.note,
    },
    assignments: assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      fullName: a.user.fullName,
      email: a.user.email,
      role: a.user.role,
      userActive: a.user.isActive,
      daysOfWeek: a.daysOfWeek,
      isActive: a.isActive,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !canManageShifts(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" },
      { status: 400 },
    );
  }

  const shift = await prisma.shift.findUnique({ where: { id: params.id } });
  if (!shift) {
    return NextResponse.json({ message: "Không tìm thấy ca" }, { status: 404 });
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!target) {
    return NextResponse.json({ message: "Không tìm thấy user" }, { status: 404 });
  }
  if (target.role !== UserRole.engineer && target.role !== UserRole.accountant) {
    return NextResponse.json(
      { message: "Chỉ gán ca cho KS hoặc kế toán" },
      { status: 400 },
    );
  }

  const uniqueDays = Array.from(new Set(parsed.data.daysOfWeek)).sort((a, b) => a - b);

  const assignment = await prisma.userShiftAssignment.upsert({
    where: {
      userId_shiftId: { userId: target.id, shiftId: shift.id },
    },
    update: {
      daysOfWeek: uniqueDays,
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    },
    create: {
      userId: target.id,
      shiftId: shift.id,
      daysOfWeek: uniqueDays,
      isActive: parsed.data.isActive ?? true,
    },
  });

  return NextResponse.json({ id: assignment.id });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !canManageShifts(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" },
      { status: 400 },
    );
  }

  await prisma.userShiftAssignment
    .delete({
      where: {
        userId_shiftId: { userId: parsed.data.userId, shiftId: params.id },
      },
    })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
