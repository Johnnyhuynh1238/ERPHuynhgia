import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { getObjectFromMinio } from "@/lib/minio";
import { findAcceptanceStaffFile } from "@/lib/acceptance-photos";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string; milestoneId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ message: "Thiếu key" }, { status: 400 });

  const milestone = await prisma.acceptanceMilestone.findFirst({
    where: {
      id: params.milestoneId,
      projectId: params.id,
      project: buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: { bienBanPhotos: true, sitePhotos: true, templateFiles: true },
  });
  if (!milestone) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  const photo = findAcceptanceStaffFile(milestone, key);
  if (!photo) return NextResponse.json({ message: "Không tìm thấy file" }, { status: 404 });

  // ?download=1 → tải về máy (giữ tên file gốc), mặc định mở xem inline.
  const download = req.nextUrl.searchParams.get("download") === "1";
  const disposition = download
    ? `attachment; filename="file.${photo.contentType === "application/pdf" ? "pdf" : "jpg"}"; filename*=UTF-8''${encodeURIComponent(photo.name || "file")}`
    : "inline";

  const { buffer, contentType } = await getObjectFromMinio(photo.key);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": photo.contentType || contentType || "image/jpeg",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=300",
    },
  });
}
