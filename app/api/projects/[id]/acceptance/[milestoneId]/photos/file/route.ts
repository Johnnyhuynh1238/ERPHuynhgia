import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { getObjectFromMinio } from "@/lib/minio";
import { findAcceptancePhoto } from "@/lib/acceptance-photos";

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
    select: { bienBanPhotos: true, sitePhotos: true },
  });
  if (!milestone) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  const photo = findAcceptancePhoto(milestone, key);
  if (!photo) return NextResponse.json({ message: "Không tìm thấy file" }, { status: 404 });

  const { buffer, contentType } = await getObjectFromMinio(photo.key);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": photo.contentType || contentType || "image/jpeg",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
}
