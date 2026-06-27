import path from "node:path";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const VIEW_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

function contentTypeFor(value: string) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  return "image/jpeg";
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!VIEW_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "received" ? "received" : "attachment";

  const receipt = await prisma.receipt.findUnique({
    where: { id: params.id },
    select: { attachmentUrl: true, receivedReceiptUrl: true },
  });
  if (!receipt) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const stored = type === "received" ? receipt.receivedReceiptUrl : receipt.attachmentUrl;
  if (!stored) return NextResponse.json({ message: "Không có file" }, { status: 404 });

  if (stored.startsWith("minio://")) {
    try {
      const obj = await getObjectFromMinio(stored.slice("minio://".length));
      return new NextResponse(new Uint8Array(obj.buffer), {
        headers: {
          "Content-Type": obj.contentType || contentTypeFor(stored),
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      return NextResponse.json({ message: "Không đọc được file" }, { status: 502 });
    }
  }

  return NextResponse.redirect(stored);
}
