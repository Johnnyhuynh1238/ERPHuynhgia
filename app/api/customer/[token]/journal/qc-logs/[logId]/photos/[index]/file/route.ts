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

export async function GET(_request: Request, { params }: { params: { token: string; logId: string; index: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const photoIndex = Number(params.index);
  if (!Number.isInteger(photoIndex) || photoIndex < 0) return NextResponse.json({ message: "Ảnh QC không hợp lệ" }, { status: 400 });

  const log = await prisma.taskQcLog.findFirst({
    where: { id: params.logId, task: { projectId: access.project.id, isActive: true, visibleToCustomer: true } },
    select: { photos: true },
  });
  const url = log?.photos[photoIndex];
  if (!url) return NextResponse.json({ message: "Không tìm thấy ảnh QC" }, { status: 404 });

  const key = minioKey(url);
  if (key) return serveMinioImage(key);
  return NextResponse.redirect(url);
}
