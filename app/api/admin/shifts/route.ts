import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canManageShifts, hhmmToMinutes, isValidHHmm } from "@/lib/shifts";

const createSchema = z.object({
  name: z.string().trim().min(2, "Tên ca tối thiểu 2 ký tự").max(50),
  startTime: z.string().refine(isValidHHmm, "Giờ vào phải dạng HH:mm"),
  endTime: z.string().refine(isValidHHmm, "Giờ ra phải dạng HH:mm"),
  graceMinutes: z.number().int().min(0).max(60).default(5),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !canManageShifts(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const shifts = await prisma.shift.findMany({
    orderBy: [{ isActive: "desc" }, { startTime: "asc" }],
    include: {
      _count: { select: { assignments: true } },
    },
  });

  return NextResponse.json({
    shifts: shifts.map((s) => ({
      id: s.id,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      graceMinutes: s.graceMinutes,
      isActive: s.isActive,
      note: s.note,
      assignedCount: s._count.assignments,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !canManageShifts(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" },
      { status: 400 },
    );
  }
  if (hhmmToMinutes(parsed.data.endTime) <= hhmmToMinutes(parsed.data.startTime)) {
    return NextResponse.json({ message: "Giờ ra phải lớn hơn giờ vào" }, { status: 400 });
  }

  try {
    const shift = await prisma.shift.create({
      data: {
        name: parsed.data.name,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        graceMinutes: parsed.data.graceMinutes,
        note: parsed.data.note || null,
      },
    });
    return NextResponse.json({ id: shift.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ message: "Tên ca đã tồn tại" }, { status: 409 });
    }
    throw err;
  }
}
