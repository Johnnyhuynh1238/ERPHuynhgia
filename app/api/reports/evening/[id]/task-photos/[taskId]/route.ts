import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getReportProjectForUser } from "@/lib/reporting";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request, { params }: { params: { id: string; taskId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const report = await prisma.eveningReport.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      projectId: true,
      reporterId: true,
      submittedAt: true,
      taskReports: {
        where: { taskId: params.taskId },
        select: { id: true },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ message: "Không tìm thấy báo cáo chiều" }, { status: 404 });
  }

  const project = await getReportProjectForUser(report.projectId, { id: user.id, role: user.role });
  if (!project) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (report.reporterId !== user.id && user.role !== "admin" && user.role !== "construction_manager") {
    return NextResponse.json({ message: "Không có quyền upload ảnh báo cáo này" }, { status: 403 });
  }

  if (report.submittedAt) {
    return NextResponse.json({ message: "Báo cáo đã chốt, không thể upload thêm ảnh" }, { status: 400 });
  }

  const eveningTask = report.taskReports[0];
  if (!eveningTask) {
    return NextResponse.json({ message: "Task chưa có trong báo cáo chiều" }, { status: 404 });
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

  const uploadDir = path.join(process.cwd(), "public", "uploads", "reports", "evening", params.id, "tasks", params.taskId);
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
        taskId: params.taskId,
        eveningReportTaskId: eveningTask.id,
        uploadedBy: user.id,
        photoUrl: `/uploads/reports/evening/${params.id}/tasks/${params.taskId}/${photoFilename}`,
        thumbnailUrl: `/uploads/reports/evening/${params.id}/tasks/${params.taskId}/${thumbFilename}`,
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

  return NextResponse.json({ photos: created, message: `Đã upload ${created.length} ảnh task` });
}

export async function DELETE(request: Request, { params }: { params: { id: string; taskId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const report = await prisma.eveningReport.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      projectId: true,
      reporterId: true,
      submittedAt: true,
    },
  });

  if (!report) {
    return NextResponse.json({ message: "Không tìm thấy báo cáo chiều" }, { status: 404 });
  }

  const project = await getReportProjectForUser(report.projectId, { id: user.id, role: user.role });
  if (!project) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (report.reporterId !== user.id && user.role !== "admin" && user.role !== "construction_manager") {
    return NextResponse.json({ message: "Không có quyền xóa ảnh báo cáo này" }, { status: 403 });
  }

  if (report.submittedAt) {
    return NextResponse.json({ message: "Báo cáo đã chốt, không thể xóa ảnh" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const photoId = searchParams.get("photoId");

  if (!photoId) {
    return NextResponse.json({ message: "Thiếu photoId" }, { status: 400 });
  }

  const photo = await prisma.taskPhoto.findFirst({
    where: {
      id: photoId,
      taskId: params.taskId,
      eveningReportTask: {
        eveningReportId: params.id,
      },
    },
    select: {
      id: true,
      uploadedBy: true,
      photoUrl: true,
      thumbnailUrl: true,
    },
  });

  if (!photo) {
    return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });
  }

  if (user.role !== "admin" && user.role !== "construction_manager" && photo.uploadedBy !== user.id) {
    return NextResponse.json({ message: "Không có quyền xóa ảnh này" }, { status: 403 });
  }

  await prisma.taskPhoto.delete({ where: { id: photo.id } });

  const absolutePhoto = path.join(process.cwd(), "public", photo.photoUrl.replace(/^\//, ""));
  const absoluteThumb = path.join(process.cwd(), "public", photo.thumbnailUrl.replace(/^\//, ""));

  await Promise.allSettled([fs.unlink(absolutePhoto), fs.unlink(absoluteThumb)]);

  return NextResponse.json({ message: "Đã xóa ảnh task" });
}
