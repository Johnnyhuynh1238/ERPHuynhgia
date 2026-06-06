import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { parseLatLng, uploadAttendanceSelfie } from "@/lib/attendance";
import { resolveCheckOutShift } from "@/lib/shift-resolver";
import { reverseGeocodeVn } from "@/lib/reverse-geocode";
import { fireAndForget, notifyKsAttendance } from "@/lib/notifications";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || (user.role !== "engineer" && user.role !== "accountant")) {
    return NextResponse.json({ message: "Bạn không có quyền chấm công" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Thiếu ảnh selfie" }, { status: 400 });
  }

  const open = await prisma.ksAttendance.findFirst({
    where: { userId: user.id, checkOutAt: null },
    orderBy: { checkInAt: "desc" },
    select: { id: true, checkInAt: true, shiftIdAtCheckIn: true },
  });
  if (!open) {
    return NextResponse.json(
      { message: "Bạn chưa có phiên chấm vào. Hãy Chấm vào trước." },
      { status: 409 },
    );
  }

  const { lat, lng, accuracy } = parseLatLng(formData);
  if (lat === null || lng === null) {
    return NextResponse.json(
      { message: "Thiếu vị trí GPS. Vui lòng bật định vị và cho phép truy cập vị trí rồi chấm lại." },
      { status: 400 },
    );
  }
  const noteRaw = formData.get("note");
  const note = typeof noteRaw === "string" ? noteRaw.trim().slice(0, 500) : null;

  let photoKey: string;
  try {
    photoKey = await uploadAttendanceSelfie({ userId: user.id, kind: "out", file });
  } catch (err) {
    const code = (err as Error).message;
    if (code === "INVALID_MIME") return NextResponse.json({ message: "Ảnh phải là JPG/PNG/WEBP/HEIC" }, { status: 400 });
    if (code === "EMPTY_FILE") return NextResponse.json({ message: "File ảnh rỗng" }, { status: 400 });
    if (code === "FILE_TOO_LARGE") return NextResponse.json({ message: "Ảnh tối đa 8MB" }, { status: 400 });
    throw err;
  }

  const now = new Date();
  const durationMinutes = Math.max(
    0,
    Math.round((now.getTime() - open.checkInAt.getTime()) / 60000),
  );

  const { shiftId, earlyLeaveMinutes } = await resolveCheckOutShift({
    userId: user.id,
    at: now,
    hintShiftId: open.shiftIdAtCheckIn,
  });

  const address = await reverseGeocodeVn(lat, lng);

  const row = await prisma.ksAttendance.update({
    where: { id: open.id },
    data: {
      checkOutAt: now,
      checkOutLat: lat,
      checkOutLng: lng,
      checkOutAccuracy: accuracy,
      checkOutPhotoKey: photoKey,
      checkOutAddress: address,
      durationMinutes,
      shiftIdAtCheckOut: shiftId,
      earlyLeaveMinutes,
      note: note || null,
    },
    select: { id: true, checkOutAt: true, durationMinutes: true },
  });

  fireAndForget(
    notifyKsAttendance({
      actorUserId: user.id,
      actorName: user.name || user.email || "KS",
      kind: "check_out",
      at: row.checkOutAt ?? now,
      earlyLeaveMinutes,
      durationMinutes: row.durationMinutes,
    }),
  );

  return NextResponse.json({
    id: row.id,
    checkOutAt: row.checkOutAt,
    durationMinutes: row.durationMinutes,
    message: "Đã chấm ra",
  });
}
