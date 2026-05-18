import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { logProjectActivity } from "@/lib/project-activity-log";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 30;

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function safeBaseName(name: string) {
  return safeFilename(name || "design").replace(/\.(jpe?g|png|webp)$/i, "").slice(0, 80) || "design";
}

function getSubmittedFiles(formData: FormData) {
  const seen = new Set<string>();
  return [...formData.getAll("file"), ...formData.getAll("files")]
    .filter((item): item is File => item instanceof File)
    .filter((file) => {
      const key = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function POST(request: Request, { params }: { params: { id: string; groupId: string } }) {
  let current;
  try {
    current = await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  try {
    const group = await prisma.designPhotoGroup.findFirst({
      where: { id: params.groupId, projectId: params.id },
      select: { id: true, title: true },
    });
    if (!group) return NextResponse.json({ message: "Không tìm thấy nhóm ảnh" }, { status: 404 });

    const formData = await request.formData();
    const files = getSubmittedFiles(formData);
    if (files.length === 0) return NextResponse.json({ message: "Vui lòng chọn ít nhất 1 ảnh" }, { status: 400 });
    if (files.length > MAX_FILES) {
      return NextResponse.json({ message: `Chỉ được upload tối đa ${MAX_FILES} ảnh mỗi lần` }, { status: 400 });
    }
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ message: `File ${file.name} không đúng định dạng ảnh` }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ message: `File ${file.name} vượt quá 25MB` }, { status: 400 });
      }
    }

    const orderAgg = await prisma.designPhoto.aggregate({
      where: { groupId: params.groupId },
      _max: { displayOrder: true },
    });
    let nextOrder = (orderAgg._max.displayOrder ?? -1) + 1;

    const created: Array<{ id: string; photoUrl: string; thumbnailUrl: string; displayOrder: number }> = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const id = randomUUID();
      const baseName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBaseName(file.name)}`;
      const photoKey = `design-photos/${params.id}/${params.groupId}/${id}_${baseName}.${ext}`;
      const thumbKey = `design-photos/${params.id}/${params.groupId}/${id}_${baseName}_thumb.jpg`;
      const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

      let thumbBuffer: Buffer;
      try {
        thumbBuffer = await sharp(buffer).rotate().resize(480, 480, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
      } catch (err) {
        console.error("Design photo sharp resize failed", { file: file.name, err });
        return NextResponse.json({ message: `File ${file.name} không đọc được ảnh` }, { status: 400 });
      }

      try {
        await Promise.all([
          putObjectToMinio({ key: photoKey, body: buffer, contentType }),
          putObjectToMinio({ key: thumbKey, body: thumbBuffer, contentType: "image/jpeg" }),
        ]);
      } catch (err) {
        console.error("Design photo MinIO upload failed", { photoKey, err });
        const detail = err instanceof Error ? err.message : "unknown";
        return NextResponse.json({ message: `Lỗi lưu trữ ảnh: ${detail}` }, { status: 500 });
      }

      const row = await prisma.designPhoto.create({
        data: {
          id,
          groupId: params.groupId,
          photoUrl: `minio://${photoKey}`,
          thumbnailUrl: `minio://${thumbKey}`,
          fileSizeKb: Math.ceil(file.size / 1024),
          displayOrder: nextOrder,
          uploadedBy: current.id,
        },
      });
      nextOrder += 1;
      created.push({
        id: row.id,
        photoUrl: `/api/projects/${params.id}/design-photos/${row.id}/file?variant=photo`,
        thumbnailUrl: `/api/projects/${params.id}/design-photos/${row.id}/file?variant=thumb`,
        displayOrder: row.displayOrder,
      });
    }

    if (created.length > 0) {
      const totalSizeKb = files.reduce((sum, f) => sum + Math.ceil(f.size / 1024), 0);
      await logProjectActivity(prisma, {
        projectId: params.id,
        actorId: current.id,
        entity: "design_photo",
        entityId: params.groupId,
        action: "upload",
        summary: `Upload ${created.length} ảnh vào nhóm "${group.title}" (${(totalSizeKb / 1024).toFixed(2)} MB)`,
        metadata: {
          groupId: params.groupId,
          groupTitle: group.title,
          count: created.length,
          totalSizeKb,
          photoIds: created.map((p) => p.id),
        },
      });
    }

    return NextResponse.json({ photos: created, message: `Đã upload ${created.length} ảnh` });
  } catch (error) {
    console.error("Design photo upload failed", error);
    const detail = error instanceof Error && error.message ? error.message : "Upload ảnh thất bại";
    return NextResponse.json({ message: detail }, { status: 500 });
  }
}
