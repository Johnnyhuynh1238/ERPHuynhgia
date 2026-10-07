import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { deleteObjectFromMinio, putObjectToMinio } from "@/lib/minio";
import {
  COMPANY_DOCS_EXTENSIONS,
  COMPANY_DOCS_MAX_BYTES,
  buildCompanyDocKey,
  fileExtension,
  isCompanyDocKey,
  listCompanyDocs,
} from "@/lib/company-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEW_ROLES = ["admin", "engineer", "foreman", "accountant", "construction_manager"] as const;

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

export async function GET() {
  try {
    await requireRole([...VIEW_ROLES]);
  } catch (error) {
    return authError(error);
  }
  const docs = await listCompanyDocs();
  return NextResponse.json({ docs });
}

export async function POST(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Chưa chọn file" }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ message: "File rỗng" }, { status: 400 });
  if (file.size > COMPANY_DOCS_MAX_BYTES) return NextResponse.json({ message: "File tối đa 50MB" }, { status: 400 });
  if (!COMPANY_DOCS_EXTENSIONS.has(fileExtension(file.name))) {
    return NextResponse.json({ message: "Chỉ nhận PDF, Word, Excel, PowerPoint, ảnh" }, { status: 400 });
  }
  const key = buildCompanyDocKey(file.name);
  await putObjectToMinio({
    key,
    body: Buffer.from(await file.arrayBuffer()),
    contentType: file.type || "application/octet-stream",
  });
  return NextResponse.json({ key });
}

export async function DELETE(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!isCompanyDocKey(key)) return NextResponse.json({ message: "Tài liệu không hợp lệ" }, { status: 400 });
  await deleteObjectFromMinio(key);
  return NextResponse.json({ ok: true });
}
