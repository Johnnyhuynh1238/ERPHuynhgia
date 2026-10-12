import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { deleteObjectFromMinio, putObjectToMinio } from "@/lib/minio";
import {
  COMPANY_DOCS_EXTENSIONS,
  COMPANY_DOCS_MAX_BYTES,
  buildCompanyDocKey,
  cleanFolderName,
  companyFolderMarkerKey,
  fileExtension,
  isCompanyDocKey,
  listCompanyDocs,
  moveCompanyDoc,
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
  return NextResponse.json(await listCompanyDocs());
}

export async function POST(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }
  const formData = await request.formData();
  // Tạo thư mục rỗng (chưa có file): ghi object đánh dấu .folder.
  const newFolder = formData.get("createFolder");
  if (typeof newFolder === "string") {
    const markerKey = companyFolderMarkerKey(newFolder);
    if (!markerKey) return NextResponse.json({ message: "Tên thư mục không hợp lệ" }, { status: 400 });
    await putObjectToMinio({ key: markerKey, body: Buffer.alloc(0), contentType: "application/x-directory" });
    return NextResponse.json({ folder: cleanFolderName(newFolder) });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Chưa chọn file" }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ message: "File rỗng" }, { status: 400 });
  if (file.size > COMPANY_DOCS_MAX_BYTES) return NextResponse.json({ message: "File tối đa 50MB" }, { status: 400 });
  if (!COMPANY_DOCS_EXTENSIONS.has(fileExtension(file.name))) {
    return NextResponse.json({ message: "Chỉ nhận PDF, Word, Excel, PowerPoint, ảnh" }, { status: 400 });
  }
  const folder = formData.get("folder");
  const key = buildCompanyDocKey(file.name, typeof folder === "string" ? folder : "");
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
  const params = new URL(request.url).searchParams;
  // Xoá thư mục: chỉ khi đã rỗng (xoá object đánh dấu).
  const folder = params.get("folder");
  if (folder !== null) {
    const markerKey = companyFolderMarkerKey(folder);
    if (!markerKey) return NextResponse.json({ message: "Thư mục không hợp lệ" }, { status: 400 });
    const { docs } = await listCompanyDocs();
    if (docs.some((d) => d.folder === cleanFolderName(folder))) {
      return NextResponse.json({ message: "Thư mục còn file, chuyển/xoá file trước" }, { status: 400 });
    }
    await deleteObjectFromMinio(markerKey);
    return NextResponse.json({ ok: true });
  }
  const key = params.get("key") || "";
  if (!isCompanyDocKey(key)) return NextResponse.json({ message: "Tài liệu không hợp lệ" }, { status: 400 });
  await deleteObjectFromMinio(key);
  return NextResponse.json({ ok: true });
}

// Chuyển tài liệu sang thư mục khác. body: { key, folder } — folder rỗng = đưa ra ngoài thư mục.
export async function PATCH(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }
  const body = (await request.json().catch(() => null)) as { key?: unknown; folder?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key : "";
  if (!isCompanyDocKey(key)) return NextResponse.json({ message: "Tài liệu không hợp lệ" }, { status: 400 });
  const newKey = await moveCompanyDoc(key, typeof body?.folder === "string" ? body.folder : "");
  return NextResponse.json({ key: newKey });
}
