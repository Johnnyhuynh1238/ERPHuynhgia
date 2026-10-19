import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { findKsProject, ksDocWhere } from "@/lib/ks-ql-project-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: KS phụ trách mở file hồ sơ admin đã cấp quyền (inline PDF/ảnh). ?download=1 → tải về.
export async function GET(req: Request, { params }: { params: { projectId: string; docId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const project = await findKsProject(params.projectId, user.id);
  if (!project) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const doc = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: project.id, ...ksDocWhere(user.id) },
    select: { fileName: true, fileUrl: true, mimeType: true },
  });
  if (!doc) return NextResponse.json({ message: "Không tìm thấy hồ sơ" }, { status: 404 });
  if (!doc.fileUrl.startsWith("minio://")) {
    return NextResponse.json({ message: "Đường dẫn hồ sơ không hợp lệ" }, { status: 400 });
  }

  const object = await getObjectFromMinio(doc.fileUrl.slice("minio://".length));
  const contentType = object.contentType || doc.mimeType || "application/octet-stream";
  const download = new URL(req.url).searchParams.get("download") === "1";
  const inline = !download && (contentType === "application/pdf" || contentType.startsWith("image/"));
  return new NextResponse(new Uint8Array(object.buffer), {
    headers: {
      "content-type": contentType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(doc.fileName)}"`,
      "cache-control": "private, no-store",
    },
  });
}
