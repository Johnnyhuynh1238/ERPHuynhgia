import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

function minioKey(url: string) {
  return url.startsWith("minio://") ? url.slice("minio://".length) : null;
}

export async function GET(_request: Request, { params }: { params: { draftId: string; fileId: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const file = await prisma.projectDraftFile.findFirst({
    where: { id: params.fileId, draftId: params.draftId },
    select: { id: true, fileName: true, fileUrl: true, mimeType: true },
  });
  if (!file) return NextResponse.json({ message: "Không tìm thấy hồ sơ" }, { status: 404 });

  const key = minioKey(file.fileUrl);
  if (!key) return NextResponse.json({ message: "Đường dẫn hồ sơ không hợp lệ" }, { status: 400 });

  const object = await getObjectFromMinio(key);
  const contentType = object.contentType || file.mimeType || "application/octet-stream";
  const disposition = contentType === "application/pdf" ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(object.buffer), {
    headers: {
      "content-type": contentType,
      "content-disposition": `${disposition}; filename="${encodeURIComponent(file.fileName)}"`,
    },
  });
}
