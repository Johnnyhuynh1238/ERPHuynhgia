import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type StoredPhoto = { key: string; contentType: string };

const VIEWER_ROLES = new Set<string>([
  UserRole.engineer,
  UserRole.construction_manager,
  UserRole.admin,
  UserRole.accountant,
]);

export async function GET(
  request: Request,
  { params }: { params: { id: string; seq: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!VIEWER_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const seq = Number(params.seq);
  if (!Number.isInteger(seq) || seq < 0) {
    return NextResponse.json({ message: "Sai" }, { status: 400 });
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return NextResponse.json({ message: "Thiếu key" }, { status: 400 });

  // KS chỉ xem ảnh của project mình; staff (KT/CM/admin) xem hết.
  let allowed = true;
  if (user.role === UserRole.engineer) {
    const proposal = await prisma.materialProposal.findFirst({
      where: {
        id: params.id,
        project: { memberAssignments: { some: { userId: user.id, role: "pm_engineer" } } },
      },
      select: { id: true },
    });
    allowed = !!proposal;
  }
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const receipt = await prisma.materialProposalItemReceipt.findUnique({
    where: { proposalId_itemSeq: { proposalId: params.id, itemSeq: seq } },
    select: { photos: true },
  });
  if (!receipt) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const photos = (receipt.photos as unknown as StoredPhoto[]) || [];
  const photo = photos.find((p) => p.key === key);
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const { buffer, contentType } = await getObjectFromMinio(photo.key);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": photo.contentType || contentType || "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
