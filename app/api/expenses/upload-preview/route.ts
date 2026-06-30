import path from "node:path";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set<string>([
  UserRole.admin,
  UserRole.accountant,
  UserRole.engineer,
  UserRole.construction_manager,
]);

function contentTypeFor(value: string) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  return "image/jpeg";
}

// Preview cho minio:// URL vừa upload (chưa kèm vào expense).
// Chỉ chấp nhận key bắt đầu bằng "expenses/" để không bị abuse đọc bucket khác.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const target = url.searchParams.get("url") || "";
  if (!target.startsWith("minio://expenses/")) {
    return NextResponse.json({ message: "URL không hợp lệ" }, { status: 400 });
  }

  try {
    const obj = await getObjectFromMinio(target.slice("minio://".length));
    return new NextResponse(new Uint8Array(obj.buffer), {
      headers: {
        "Content-Type": obj.contentType || contentTypeFor(target),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ message: "Không đọc được file" }, { status: 502 });
  }
}
