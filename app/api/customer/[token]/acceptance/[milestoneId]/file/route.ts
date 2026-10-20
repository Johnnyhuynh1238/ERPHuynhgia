import { NextResponse } from "next/server";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { findAcceptancePhoto } from "@/lib/acceptance-photos";

export const runtime = "nodejs";

// Cổng CN xem ảnh BB giấy đã ký + ảnh nghiệm thu của mốc.
export async function GET(request: Request, { params }: { params: { token: string; milestoneId: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const key = new URL(request.url).searchParams.get("key");
  if (!key) return NextResponse.json({ message: "Thiếu key" }, { status: 400 });

  const milestone = await prisma.acceptanceMilestone.findFirst({
    where: { id: params.milestoneId, projectId: access.project.id, kind: "chu_nha" },
    select: { bienBanPhotos: true, sitePhotos: true },
  });
  const photo = milestone ? findAcceptancePhoto(milestone, key) : undefined;
  if (!photo) return NextResponse.json({ message: "Không tìm thấy file" }, { status: 404 });

  const { buffer, contentType } = await getObjectFromMinio(photo.key);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": photo.contentType || contentType || "image/jpeg",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
}
