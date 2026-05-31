import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const row = await prisma.ksAttendance.findUnique({
    where: { id: params.id },
    select: { userId: true, checkInPhotoKey: true, checkOutPhotoKey: true },
  });
  if (!row) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const isOwner = row.userId === user.id;
  const isAdminOrTptc = user.role === "admin" || user.role === "construction_manager";
  if (!isOwner && !isAdminOrTptc) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const which = new URL(request.url).searchParams.get("which");
  const key = which === "out" ? row.checkOutPhotoKey : row.checkInPhotoKey;
  if (!key) return NextResponse.json({ message: "Không có ảnh" }, { status: 404 });

  const { buffer, contentType } = await getObjectFromMinio(key);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": contentType || "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
