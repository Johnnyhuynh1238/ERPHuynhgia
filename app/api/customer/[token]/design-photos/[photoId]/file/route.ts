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

function logFailure(reason: string, request: Request, params: { token: string; photoId: string }, extra?: Record<string, unknown>) {
  const ua = request.headers.get("user-agent") || "-";
  const ref = request.headers.get("referer") || "-";
  const cookieHeader = request.headers.get("cookie") || "";
  const hasCnPortal = cookieHeader.includes("cn_portal=");
  const hasCnSession = cookieHeader.includes("cn_session_");
  console.error(
    `[design-photo] FAIL reason=${reason} token=${params.token.slice(0, 8)}... photoId=${params.photoId} hasPortalCookie=${hasCnPortal} hasSessionCookie=${hasCnSession} ua="${ua}" referer="${ref}"`,
    extra || "",
  );
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
  if (!access.ok) {
    logFailure(`auth_${access.state}`, request, params, { status: access.status });
    return NextResponse.json({ message: access.message }, { status: access.status });
  }

  const photo = await prisma.designPhoto.findFirst({
    where: {
      id: params.photoId,
      group: { projectId: access.project.id, visibleToCustomer: true },
    },
    select: { photoUrl: true, thumbnailUrl: true },
  });
  if (!photo) {
    logFailure("photo_not_found_or_hidden", request, params);
    return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const variant = searchParams.get("variant");
  const key = extractMinioKey(variant === "thumb" ? photo.thumbnailUrl : photo.photoUrl);
  if (!key) {
    logFailure("invalid_minio_key", request, params, { variant });
    return NextResponse.json({ message: "Không đọc được ảnh" }, { status: 404 });
  }

  try {
    return await serveMinioImage(key);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logFailure("minio_fetch_failed", request, params, { variant, key, message });
    return NextResponse.json({ message: "Lỗi đọc ảnh từ kho" }, { status: 502 });
  }
}
