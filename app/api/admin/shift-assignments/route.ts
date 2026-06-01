import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canManageShifts } from "@/lib/shifts";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !canManageShifts(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const [users, assignments] = await Promise.all([
    prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [UserRole.engineer, UserRole.accountant] },
      },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    }),
    prisma.userShiftAssignment.findMany({
      include: {
        shift: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
            graceMinutes: true,
            isActive: true,
          },
        },
      },
    }),
  ]);

  const byUser = new Map<
    string,
    Array<{
      id: string;
      shiftId: string;
      shiftName: string;
      startTime: string;
      endTime: string;
      graceMinutes: number;
      shiftActive: boolean;
      daysOfWeek: number[];
      isActive: boolean;
    }>
  >();
  for (const a of assignments) {
    const list = byUser.get(a.userId) || [];
    list.push({
      id: a.id,
      shiftId: a.shiftId,
      shiftName: a.shift.name,
      startTime: a.shift.startTime,
      endTime: a.shift.endTime,
      graceMinutes: a.shift.graceMinutes,
      shiftActive: a.shift.isActive,
      daysOfWeek: a.daysOfWeek,
      isActive: a.isActive,
    });
    byUser.set(a.userId, list);
  }

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      assignments: byUser.get(u.id) || [],
    })),
  });
}
