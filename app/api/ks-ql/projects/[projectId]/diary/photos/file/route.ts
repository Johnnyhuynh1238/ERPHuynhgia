import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";

export const runtime = "nodejs";

type StoredPhoto = { key: string; contentType: string };

const VIEWER_ROLES = new Set<string>([
  UserRole.engineer,
  UserRole.construction_manager,
  UserRole.admin,
]);

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role)
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!VIEWER_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ message: "Thiếu key" }, { status: 400 });

  // KS chỉ xem ảnh của project mình; CM/admin xem hết.
  if (user.role === UserRole.engineer) {
    const allowed = await prisma.project.findFirst({
      where: {
        id: params.projectId,
        memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
      },
      select: { id: true },
    });
    if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const diaries = await prisma.constructionDiary.findMany({
    where: { projectId: params.projectId },
    select: { taskPhotos: true, sitePhotos: true },
  });
  let photo: StoredPhoto | undefined;
  for (const d of diaries) {
    const all = [
      ...((d.taskPhotos as unknown as StoredPhoto[]) || []),
      ...((d.sitePhotos as unknown as StoredPhoto[]) || []),
    ];
    photo = all.find((p) => p.key === key);
    if (photo) break;
  }
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const { buffer, contentType } = await getObjectFromMinio(photo.key);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": photo.contentType || contentType || "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
