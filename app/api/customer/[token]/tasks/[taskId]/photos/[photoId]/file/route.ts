import path from "node:path";
import { NextResponse } from "next/server";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function guessImageContentType(value: string) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function minioKey(value: string | null | undefined) {
  return value?.startsWith("minio://") ? value.slice("minio://".length) : null;
}

async function serveMinioImage(key: string) {
  const { buffer, contentType } = await getObjectFromMinio(key);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType || guessImageContentType(key),
      "Cache-Control": "private, max-age=300",
    },
  });
}

export async function GET(request: Request, { params }: { params: { token: string; taskId: string; photoId: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const photo = await prisma.taskPhoto.findFirst({
    where: { id: params.photoId, taskId: params.taskId, task: { projectId: access.project.id, isActive: true, visibleToCustomer: true } },
    select: { photoUrl: true, thumbnailUrl: true },
  });
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const variant = new URL(request.url).searchParams.get("variant") === "thumb" ? "thumb" : "photo";
  const url = variant === "thumb" ? photo.thumbnailUrl || photo.photoUrl : photo.photoUrl;
  const key = minioKey(url);
  if (key) return serveMinioImage(key);
  if (url) return NextResponse.redirect(url);
  return NextResponse.json({ message: "Không đọc được ảnh" }, { status: 404 });
}
