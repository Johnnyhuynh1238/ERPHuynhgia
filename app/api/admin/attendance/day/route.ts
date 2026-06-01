import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canViewAdminAttendance } from "@/lib/attendance-summary";

function parseYmd(s: string | null): { y: number; m: number; d: number } | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !canViewAdminAttendance(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const dateRaw = url.searchParams.get("date");
  const parsed = parseYmd(dateRaw);
  if (!userId || !parsed) {
    return NextResponse.json({ message: "Thiếu userId hoặc date" }, { status: 400 });
  }

  const workDate = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, 0, 0, 0));

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, email: true, role: true },
  });
  if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });

  const rows = await prisma.ksAttendance.findMany({
    where: { userId, workDate },
    orderBy: { checkInAt: "asc" },
    select: {
      id: true,
      checkInAt: true,
      checkOutAt: true,
      checkInLat: true,
      checkInLng: true,
      checkInAccuracy: true,
      checkOutLat: true,
      checkOutLng: true,
      checkOutAccuracy: true,
      checkInPhotoKey: true,
      checkOutPhotoKey: true,
      durationMinutes: true,
      lateMinutes: true,
      earlyLeaveMinutes: true,
      shiftIdAtCheckIn: true,
      shiftIdAtCheckOut: true,
      note: true,
    },
  });

  const shiftIds = Array.from(
    new Set(
      rows.flatMap((r) =>
        [r.shiftIdAtCheckIn, r.shiftIdAtCheckOut].filter((s): s is string => !!s),
      ),
    ),
  );
  const shifts = shiftIds.length
    ? await prisma.shift.findMany({
        where: { id: { in: shiftIds } },
        select: { id: true, name: true, startTime: true, endTime: true },
      })
    : [];
  const shiftMap = new Map(shifts.map((s) => [s.id, s]));

  return NextResponse.json({
    user: target,
    date: dateRaw,
    sessions: rows.map((r) => ({
      id: r.id,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      durationMinutes: r.durationMinutes,
      lateMinutes: r.lateMinutes,
      earlyLeaveMinutes: r.earlyLeaveMinutes,
      checkInLat: r.checkInLat ? Number(r.checkInLat) : null,
      checkInLng: r.checkInLng ? Number(r.checkInLng) : null,
      checkInAccuracy: r.checkInAccuracy ? Number(r.checkInAccuracy) : null,
      checkOutLat: r.checkOutLat ? Number(r.checkOutLat) : null,
      checkOutLng: r.checkOutLng ? Number(r.checkOutLng) : null,
      checkOutAccuracy: r.checkOutAccuracy ? Number(r.checkOutAccuracy) : null,
      hasCheckInPhoto: !!r.checkInPhotoKey,
      hasCheckOutPhoto: !!r.checkOutPhotoKey,
      shiftIn: r.shiftIdAtCheckIn ? shiftMap.get(r.shiftIdAtCheckIn) || null : null,
      shiftOut: r.shiftIdAtCheckOut ? shiftMap.get(r.shiftIdAtCheckOut) || null : null,
      note: r.note,
    })),
  });
}
