import sharp from "sharp";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request, { params }: { params: { logId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const log = await prisma.taskQcLog.findUnique({ where: { id: params.logId } });
  if (!log) return NextResponse.json({ message: "Không tìm thấy QC log" }, { status: 404 });

  const canUpdate = log.checkedBy === user.id || user.role === UserRole.admin || user.role === UserRole.construction_manager;
  if (!canUpdate) return NextResponse.json({ message: "Không có quyền bổ sung ảnh" }, { status: 403 });

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f) => f instanceof File) as File[];
  if (files.length === 0) return NextResponse.json({ message: "Vui lòng chọn ít nhất 1 ảnh" }, { status: 400 });

  const newPhotos: string[] = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ message: `File ${file.name} không đúng định dạng ảnh` }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ message: `File ${file.name} vượt quá 8MB` }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeFilename(file.name)}.${ext}`;
    const outputBuffer =
      ext === "jpg"
        ? await sharp(buffer).jpeg({ quality: 88 }).toBuffer()
        : ext === "png"
          ? await sharp(buffer).png({ compressionLevel: 9 }).toBuffer()
          : await sharp(buffer).webp({ quality: 88 }).toBuffer();
    const key = `qc-logs/tasks/${log.taskId}/${log.qcItemId}/${filename}`;
    const outType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    await putObjectToMinio({ key, body: outputBuffer, contentType: outType });
    newPhotos.push(`minio://${key}`);
  }

  const updated = await prisma.taskQcLog.update({
    where: { id: params.logId },
    data: { photos: [...(log.photos || []), ...newPhotos] },
  });

  return NextResponse.json({ log: updated, message: "Đã bổ sung ảnh QC" });
}
