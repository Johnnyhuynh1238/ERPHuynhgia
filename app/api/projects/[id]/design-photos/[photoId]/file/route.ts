import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { canViewDesignGroup, extractMinioKey } from "@/lib/design-photos";

export const runtime = "nodejs";

function guessImageContentType(value: string) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function serveMinioImage(key: string) {
  const { buffer, contentType } = await getObjectFromMinio(key);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": contentType || guessImageContentType(key),
      "Cache-Control": "private, max-age=300",
    },
  });
}

export async function GET(request: Request, { params }: { params: { id: string; photoId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const photo = await prisma.designPhoto.findFirst({
    where: { id: params.photoId, group: { projectId: params.id } },
    select: { groupId: true, photoUrl: true, thumbnailUrl: true },
  });
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const allowed = await canViewDesignGroup({ id: user.id, role: user.role }, photo.groupId);
  if (!allowed) return NextResponse.json({ message: "Không có quyền xem ảnh này" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const variant = searchParams.get("variant");
  const key = extractMinioKey(variant === "thumb" ? photo.thumbnailUrl : photo.photoUrl);
  if (!key) return NextResponse.json({ message: "Không đọc được ảnh" }, { status: 404 });
  return serveMinioImage(key);
}
