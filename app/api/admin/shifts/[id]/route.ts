import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canManageShifts, hhmmToMinutes, isValidHHmm } from "@/lib/shifts";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  startTime: z.string().refine(isValidHHmm, "Giờ vào phải dạng HH:mm").optional(),
  endTime: z.string().refine(isValidHHmm, "Giờ ra phải dạng HH:mm").optional(),
  graceMinutes: z.number().int().min(0).max(60).optional(),
  isActive: z.boolean().optional(),
  note: z.string().trim().max(200).optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !canManageShifts(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" },
      { status: 400 },
    );
  }

  const existing = await prisma.shift.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ message: "Không tìm thấy ca" }, { status: 404 });
  }

  const nextStart = parsed.data.startTime ?? existing.startTime;
  const nextEnd = parsed.data.endTime ?? existing.endTime;
  if (hhmmToMinutes(nextEnd) <= hhmmToMinutes(nextStart)) {
    return NextResponse.json({ message: "Giờ ra phải lớn hơn giờ vào" }, { status: 400 });
  }

  try {
    const updated = await prisma.shift.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.startTime !== undefined ? { startTime: parsed.data.startTime } : {}),
        ...(parsed.data.endTime !== undefined ? { endTime: parsed.data.endTime } : {}),
        ...(parsed.data.graceMinutes !== undefined ? { graceMinutes: parsed.data.graceMinutes } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        ...(parsed.data.note !== undefined ? { note: parsed.data.note || null } : {}),
      },
    });
    return NextResponse.json({ id: updated.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ message: "Tên ca đã tồn tại" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !canManageShifts(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const existing = await prisma.shift.findUnique({
    where: { id: params.id },
    include: { _count: { select: { assignments: true } } },
  });
  if (!existing) {
    return NextResponse.json({ message: "Không tìm thấy ca" }, { status: 404 });
  }

  await prisma.shift.delete({ where: { id: params.id } });
  return NextResponse.json({
    ok: true,
    removedAssignments: existing._count.assignments,
  });
}
