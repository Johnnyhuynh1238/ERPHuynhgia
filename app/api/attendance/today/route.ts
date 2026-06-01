import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getWorkDateVn } from "@/lib/attendance";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || (user.role !== "engineer" && user.role !== "accountant")) {
    return NextResponse.json({ message: "Không có quyền xem" }, { status: 403 });
  }

  const workDate = getWorkDateVn();
  const sessions = await prisma.ksAttendance.findMany({
    where: { userId: user.id, workDate },
    orderBy: { checkInAt: "asc" },
    select: {
      id: true,
      checkInAt: true,
      checkInLat: true,
      checkInLng: true,
      checkInAccuracy: true,
      checkInPhotoKey: true,
      checkOutAt: true,
      checkOutLat: true,
      checkOutLng: true,
      checkOutAccuracy: true,
      checkOutPhotoKey: true,
      durationMinutes: true,
      note: true,
    },
  });

  const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const open = sessions.find((s) => !s.checkOutAt) || null;

  return NextResponse.json({
    date: workDate,
    sessions: sessions.map((s) => ({
      id: s.id,
      checkInAt: s.checkInAt,
      checkInLat: s.checkInLat ? Number(s.checkInLat) : null,
      checkInLng: s.checkInLng ? Number(s.checkInLng) : null,
      checkInAccuracy: s.checkInAccuracy ? Number(s.checkInAccuracy) : null,
      hasCheckInPhoto: Boolean(s.checkInPhotoKey),
      checkOutAt: s.checkOutAt,
      checkOutLat: s.checkOutLat ? Number(s.checkOutLat) : null,
      checkOutLng: s.checkOutLng ? Number(s.checkOutLng) : null,
      checkOutAccuracy: s.checkOutAccuracy ? Number(s.checkOutAccuracy) : null,
      hasCheckOutPhoto: Boolean(s.checkOutPhotoKey),
      durationMinutes: s.durationMinutes,
      note: s.note,
    })),
    totalMinutes,
    hasOpenSession: Boolean(open),
    openSessionId: open?.id || null,
  });
}
