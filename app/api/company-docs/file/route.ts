import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { companyDocFileName, isCompanyDocKey } from "@/lib/company-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

// ?key=company-docs/<uuid>/<tên> · &download=1 → tải về máy, mặc định xem inline (PDF/ảnh).
export async function GET(request: Request) {
  try {
    await requireRole(["admin", "engineer", "foreman", "accountant", "construction_manager"]);
  } catch (error) {
    return authError(error);
  }
  const sp = new URL(request.url).searchParams;
  const key = sp.get("key") || "";
  if (!isCompanyDocKey(key)) return NextResponse.json({ message: "Tài liệu không hợp lệ" }, { status: 400 });

  let object;
  try {
    object = await getObjectFromMinio(key);
  } catch {
    return NextResponse.json({ message: "Không tìm thấy tài liệu" }, { status: 404 });
  }
  const fileName = companyDocFileName(key);
  const contentType = object.contentType || "application/octet-stream";
  const inline = sp.get("download") !== "1" && (contentType === "application/pdf" || contentType.startsWith("image/"));
  const ascii = fileName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^\x20-\x7e]|"/g, "_");

  return new NextResponse(new Uint8Array(object.buffer), {
    headers: {
      "content-type": contentType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "private, no-store",
    },
  });
}
