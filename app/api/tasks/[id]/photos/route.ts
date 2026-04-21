import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { TaskLogType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canUploadPhoto, getTaskWithAccess } from "@/lib/task-permissions";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed || !canUploadPhoto(task, { id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền upload ảnh" }, { status: 403 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f) => f instanceof File) as File[];

  if (files.length === 0) {
    return NextResponse.json({ message: "Vui lòng chọn ít nhất 1 ảnh" }, { status: 400 });
  }

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ message: `File ${file.name} không đúng định dạng ảnh` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ message: `File ${file.name} vượt quá 5MB` }, { status: 400 });
    }
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "tasks", params.id);
  await fs.mkdir(uploadDir, { recursive: true });

  const created = [];

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const baseName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeFilename(file.name)}`;

    const photoFilename = `${baseName}.${ext}`;
    const thumbFilename = `${baseName}_thumb.jpg`;

    const photoPath = path.join(uploadDir, photoFilename);
    const thumbPath = path.join(uploadDir, thumbFilename);

    await fs.writeFile(photoPath, buffer);

    await sharp(buffer)
      .resize(200, 200, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);

    const row = await prisma.taskPhoto.create({
      data: {
        taskId: params.id,
        uploadedBy: user.id,
        photoUrl: `/uploads/tasks/${params.id}/${photoFilename}`,
        thumbnailUrl: `/uploads/tasks/${params.id}/${thumbFilename}`,
        caption: null,
        fileSizeKb: Math.ceil(file.size / 1024),
        takenAt: null,
      },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    created.push(row);
  }

  await prisma.taskLog.create({
    data: {
      taskId: params.id,
      userId: user.id,
      logType: TaskLogType.photo_uploaded,
      content: `Đã upload ${created.length} ảnh`,
    },
  });

  return NextResponse.json({ photos: created, message: `Đã upload ${created.length} ảnh` });
}
