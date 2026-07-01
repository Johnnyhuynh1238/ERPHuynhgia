import { NextResponse } from "next/server";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type StoredPhoto = { key: string; contentType?: string };

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) {
    return NextResponse.json({ message: access.message }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ message: "Thiếu key" }, { status: 400 });

  const diaries = await prisma.constructionDiary.findMany({
    where: { projectId: access.project.id },
    select: { taskPhotos: true, sitePhotos: true },
  });

  let stored: StoredPhoto | undefined;
  for (const d of diaries) {
    const all = [
      ...((d.taskPhotos as unknown as StoredPhoto[]) || []),
      ...((d.sitePhotos as unknown as StoredPhoto[]) || []),
    ];
    stored = all.find((p) => p.key === key);
    if (stored) break;
  }
  if (!stored) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const { buffer, contentType } = await getObjectFromMinio(stored.key);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": stored.contentType || contentType || "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
