import path from "node:path";
import { NextResponse } from "next/server";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

function guessImageContentType(value: string) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function extractMinioKey(value: string) {
  if (value.startsWith("minio://")) return value.slice("minio://".length);
  try {
    return new URL(value, "http://local").searchParams.get("key");
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: { id: string; photoId: string } }) {
  const photo = await prisma.taskPhoto.findFirst({
    where: { id: params.photoId, taskId: params.id },
    select: { photoUrl: true, thumbnailUrl: true },
  });

  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const allowedKeys = [extractMinioKey(photo.photoUrl), extractMinioKey(photo.thumbnailUrl)].filter(Boolean);

  if (key && allowedKeys.includes(key)) {
    const { buffer, contentType } = await getObjectFromMinio(key);
    return new Response(buffer as BodyInit, {
      headers: {
        "Content-Type": contentType || guessImageContentType(key),
        "Cache-Control": "private, max-age=120",
      },
    });
  }

  return NextResponse.json({ message: "Không đọc được ảnh" }, { status: 404 });
}
