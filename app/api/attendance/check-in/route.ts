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
  if (!user?.id || user.role !== "engineer") {
    return NextResponse.json({ message: "Chỉ kỹ sư được chấm công" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Thiếu ảnh selfie" }, { status: 400 });
  }

  // Chặn check-in mới khi vẫn còn phiên chưa check-out
  const open = await prisma.ksAttendance.findFirst({
    where: { userId: user.id, checkOutAt: null },
    select: { id: true, checkInAt: true },
    orderBy: { checkInAt: "desc" },
  });
  if (open) {
    return NextResponse.json(
      { message: "Bạn còn 1 phiên chấm công chưa Chấm ra. Hãy Chấm ra trước." },
      { status: 409 },
    );
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

  const now = new Date();
  const workDate = getWorkDateVn(now);

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

  return NextResponse.json({ id: row.id, checkInAt: row.checkInAt, message: "Đã chấm vào" });
}
