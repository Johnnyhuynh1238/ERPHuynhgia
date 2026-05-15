import path from "node:path";
import { NextResponse } from "next/server";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { extractMinioKey } from "@/lib/design-photos";

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

export async function GET(request: Request, { params }: { params: { token: string; photoId: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const photo = await prisma.designPhoto.findFirst({
    where: {
      id: params.photoId,
      group: { projectId: access.project.id, visibleToCustomer: true },
    },
    select: { photoUrl: true, thumbnailUrl: true },
  });
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const variant = searchParams.get("variant");
  const key = extractMinioKey(variant === "thumb" ? photo.thumbnailUrl : photo.photoUrl);
  if (!key) return NextResponse.json({ message: "Không đọc được ảnh" }, { status: 404 });
  return serveMinioImage(key);
}
