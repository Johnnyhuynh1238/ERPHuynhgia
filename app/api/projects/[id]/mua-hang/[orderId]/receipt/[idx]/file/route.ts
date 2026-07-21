import path from "node:path";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

function guessType(value: string) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  return "image/jpeg";
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string; orderId: string; idx: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const order = await prisma.mhOrder.findFirst({
    where: { id: params.orderId, projectId: params.id },
    select: { receiptImages: true },
  });
  if (!order) return NextResponse.json({ message: "Không tìm thấy đơn" }, { status: 404 });

  const imgs = (order.receiptImages as unknown as { url: string; kind: string }[]) || [];
  const idx = Number(params.idx);
  const img = Number.isInteger(idx) ? imgs[idx] : undefined;
  const key = img?.url?.startsWith("minio://") ? img.url.slice("minio://".length) : null;
  if (!key) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const { buffer, contentType } = await getObjectFromMinio(key);
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": contentType || guessType(key),
      "Cache-Control": "private, max-age=300",
    },
  });
}
