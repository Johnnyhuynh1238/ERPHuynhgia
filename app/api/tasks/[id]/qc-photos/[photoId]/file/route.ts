import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTaskWithAccess } from "@/lib/task-permissions";
import { prisma } from "@/lib/prisma";
import { getObjectFromMinio } from "@/lib/minio";

function getContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function GET(_request: Request, { params }: { params: { id: string; photoId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const photo = await prisma.qcPhoto.findFirst({
    where: { id: params.photoId, taskId: params.id },
    select: { url: true },
  });

  if (!photo) {
    return NextResponse.json({ message: "Không tìm thấy ảnh QC" }, { status: 404 });
  }

  if (photo.url.startsWith("minio://")) {
    const key = photo.url.replace("minio://", "");
    try {
      const obj = await getObjectFromMinio(key);
      return new NextResponse(new Uint8Array(obj.buffer), {
        status: 200,
        headers: {
          "Content-Type": obj.contentType,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      return NextResponse.json({ message: "Không đọc được ảnh từ MinIO" }, { status: 404 });
    }
  }

  const filePath = path.join(process.cwd(), "public", photo.url.replace(/^\//, ""));
  try {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": getContentType(filePath),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ message: "Không đọc được file ảnh" }, { status: 404 });
  }
}
