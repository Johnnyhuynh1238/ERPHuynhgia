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
  { params }: { params: { id: string; deliveryId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!VIEWER_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const kind = url.searchParams.get("kind"); // "invoice" | "goods"
  if (!key || (kind !== "invoice" && kind !== "goods")) {
    return NextResponse.json({ message: "Thiếu key/kind" }, { status: 400 });
  }

  const delivery = await prisma.materialProposalDelivery.findFirst({
    where: { id: params.deliveryId, proposalId: params.id },
    select: {
      invoicePhotos: true,
      goodsPhotos: true,
      proposal: { select: { ksId: true } },
    },
  });
  if (!delivery) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  if (user.role === UserRole.engineer && delivery.proposal.ksId !== user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const pool = ((kind === "invoice" ? delivery.invoicePhotos : delivery.goodsPhotos) as unknown as
    StoredPhoto[]) || [];
  const photo = pool.find((p) => p.key === key);
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const { buffer, contentType } = await getObjectFromMinio(photo.key);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": photo.contentType || contentType || "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
