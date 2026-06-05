import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { projectId: string; workerId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  // Admin xem mọi dự án. Các role khác (KS, TPTC, kế toán) phải là member của dự án.
  if (user.role !== "admin") {
    const membership = await prisma.projectMemberAssignment.findFirst({
      where: { userId: user.id, projectId: params.projectId },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const worker = await prisma.worker.findFirst({
    where: { id: params.workerId, projectId: params.projectId },
    select: { idCardPhotoUrl: true },
  });
  if (!worker?.idCardPhotoUrl) {
    return NextResponse.json({ message: "Không có ảnh CCCD" }, { status: 404 });
  }

  const { buffer, contentType } = await getObjectFromMinio(worker.idCardPhotoUrl);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": contentType || "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
