import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { getTaskWithAccess } from "@/lib/task-permissions";

export const runtime = "nodejs";

function guessImageContentType(value: string) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function extractMinioKey(value: string | null) {
  if (!value) return null;
  if (value.startsWith("minio://")) return value.slice("minio://".length);
  try {
    return new URL(value, "http://local").searchParams.get("key");
  } catch {
    return null;
  }
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

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const photo = await prisma.taskPhoto.findFirst({
    where: { id: params.photoId, taskId: params.id },
    select: { photoUrl: true, thumbnailUrl: true },
  });

  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const variant = searchParams.get("variant");
  if (variant === "photo" || variant === "thumb") {
    const key = extractMinioKey(variant === "thumb" ? photo.thumbnailUrl : photo.photoUrl);
    if (!key) return NextResponse.json({ message: "Không đọc được ảnh" }, { status: 404 });
    return serveMinioImage(key);
  }

  const key = searchParams.get("key");
  const allowedKeys = [extractMinioKey(photo.photoUrl), extractMinioKey(photo.thumbnailUrl)].filter(Boolean);

  if (key && allowedKeys.includes(key)) {
    return serveMinioImage(key);
  }

  return NextResponse.json({ message: "Không đọc được ảnh" }, { status: 404 });
}
