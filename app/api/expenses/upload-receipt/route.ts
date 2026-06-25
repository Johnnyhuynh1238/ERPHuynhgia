import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { putObjectToMinio } from "@/lib/minio";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_ROLES = new Set<string>([
  UserRole.admin,
  UserRole.accountant,
  UserRole.engineer,
  UserRole.construction_manager,
]);

function extFromType(type: string) {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic") return "heic";
  if (type === "image/heif") return "heif";
  return "jpg";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền upload" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const kind = String(formData.get("kind") || "attachment");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Thiếu file" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ message: "Chỉ hỗ trợ ảnh jpg/png/webp/heic hoặc PDF" }, { status: 400 });
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ message: "File quá lớn (tối đa 8MB)" }, { status: 400 });
  }

  const ext = extFromType(file.type);
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const key = `expenses/${kind === "receipt" ? "receipts" : "attachments"}/${fileName}`;
  await putObjectToMinio({ key, body: Buffer.from(bytes), contentType: file.type });

  return NextResponse.json({ url: `minio://${key}` });
}
