import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

function guessImageContentType(url: string) {
  const ext = path.extname(url).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function GET(_request: Request, { params }: { params: { id: string; photoId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const photo = await prisma.taskReportPhoto.findFirst({ where: { id: params.photoId, taskId: params.id } });
  if (!photo) return NextResponse.json({ message: "Photo not found" }, { status: 404 });

  if (photo.fileUrl.startsWith("minio://")) {
    const key = photo.fileUrl.replace("minio://", "");
    const { buffer, contentType } = await getObjectFromMinio(key);
    return new Response(buffer as BodyInit, { headers: { "Content-Type": contentType || guessImageContentType(photo.fileUrl), "Cache-Control": "private, max-age=120" } });
  }

  return NextResponse.json({ message: "Unsupported source" }, { status: 400 });
}
