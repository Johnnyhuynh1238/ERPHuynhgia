import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  getWorkDateVn,
  parseLatLng,
  uploadAttendanceSelfie,
} from "@/lib/attendance";

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

  const now = new Date();
  const workDate = getWorkDateVn(now);

  // Chỉ chặn nếu phiên hở thuộc đúng hôm nay; phiên hở của ngày cũ (KS quên chấm ra)
  // sẽ được tự đóng với durationMinutes=0 + note để kế toán điều chỉnh sau.
  const opens = await prisma.ksAttendance.findMany({
    where: { userId: user.id, checkOutAt: null },
    select: { id: true, workDate: true, checkInAt: true, note: true },
    orderBy: { checkInAt: "asc" },
  });
  const openToday = opens.find((o) => o.workDate.getTime() === workDate.getTime());
  if (openToday) {
    return NextResponse.json(
      { message: "Bạn còn 1 phiên chấm công hôm nay chưa Chấm ra. Hãy Chấm ra trước." },
      { status: 409 },
    );
  }
  const stale = opens.filter((o) => o.workDate.getTime() !== workDate.getTime());
  let autoClosedCount = 0;
  if (stale.length > 0) {
    const AUTO_NOTE = "Tự đóng do quên chấm ra. Vui lòng báo kế toán để điều chỉnh.";
    await Promise.all(
      stale.map((o) =>
        prisma.ksAttendance.update({
          where: { id: o.id },
          data: {
            checkOutAt: o.checkInAt,
            durationMinutes: 0,
            note: o.note ? `${o.note}\n${AUTO_NOTE}` : AUTO_NOTE,
          },
        }),
      ),
    );
    autoClosedCount = stale.length;
  }

  const { lat, lng, accuracy } = parseLatLng(formData);

  let photoKey: string;
  try {
    photoKey = await uploadAttendanceSelfie({ userId: user.id, kind: "in", file });
  } catch (err) {
    const code = (err as Error).message;
    if (code === "INVALID_MIME") return NextResponse.json({ message: "Ảnh phải là JPG/PNG/WEBP/HEIC" }, { status: 400 });
    if (code === "EMPTY_FILE") return NextResponse.json({ message: "File ảnh rỗng" }, { status: 400 });
    if (code === "FILE_TOO_LARGE") return NextResponse.json({ message: "Ảnh tối đa 8MB" }, { status: 400 });
    throw err;
  }

  const row = await prisma.ksAttendance.create({
    data: {
      userId: user.id,
      workDate,
      checkInAt: now,
      checkInLat: lat,
      checkInLng: lng,
      checkInAccuracy: accuracy,
      checkInPhotoKey: photoKey,
    },
    select: { id: true, checkInAt: true },
  });

  const message =
    autoClosedCount > 0
      ? `Đã chấm vào. Đã tự đóng ${autoClosedCount} phiên cũ chưa chấm ra — liên hệ kế toán để điều chỉnh giờ.`
      : "Đã chấm vào";

  return NextResponse.json({
    id: row.id,
    checkInAt: row.checkInAt,
    autoClosedCount,
    message,
  });
}
