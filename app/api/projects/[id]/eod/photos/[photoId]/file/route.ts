import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canViewEod } from "@/lib/eod";

export const runtime = "nodejs";

function guessImageContentType(value: string) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function GET(_request: Request, { params }: { params: { id: string; photoId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewEod({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const photo = await prisma.workOrderOutputPhoto.findFirst({
    where: { id: params.photoId, output: { projectId: params.id } },
    select: { storageKey: true, contentType: true },
  });
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const { buffer, contentType } = await getObjectFromMinio(photo.storageKey);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": photo.contentType || contentType || guessImageContentType(photo.storageKey),
      "Cache-Control": "private, max-age=300",
    },
  });
}
