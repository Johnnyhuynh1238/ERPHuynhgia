import sharp from "sharp";
import { NextResponse } from "next/server";
import { ReportPhotoType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { canReport } from "@/lib/task-centric";
import { logProjectActivity } from "@/lib/project-activity-log";
import { hashPhotoBuffer, validateProgressPhotoFreshness } from "@/lib/photo-validation";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as ReportPhotoType | null;
  const reportDate = searchParams.get("reportDate");

  const rows = await prisma.taskReportPhoto.findMany({
    where: {
      taskId: params.id,
      ...(type ? { type } : {}),
      ...(reportDate ? { reportDate: new Date(reportDate) } : {}),
    },
    include: { uploader: { select: { id: true, fullName: true, email: true } } },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json({ photos: rows });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id || !user.role) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const task = await prisma.task.findUnique({ where: { id: params.id }, select: { id: true, projectId: true } });
    if (!task) return NextResponse.json({ message: "Task not found" }, { status: 404 });

    const formData = await request.formData();
    const reportType = String(formData.get("reportType") || "").trim() as ReportPhotoType;
    const reportDateRaw = String(formData.get("reportDate") || "").trim();
    const technicalReportId = String(formData.get("technicalReportId") || "").trim() || null;

    if (!["technical", "material", "labor", "equipment"].includes(reportType)) {
      return NextResponse.json({ message: "reportType không hợp lệ" }, { status: 400 });
    }
    const allowed = await canReport(user.id, user.role as any, task.projectId, reportType);
    if (!allowed) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const files = formData.getAll("files").filter((f) => f instanceof File) as File[];
    if (files.length === 0) return NextResponse.json({ message: "Vui lòng chọn ảnh" }, { status: 400 });

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ message: `File ${file.name} không đúng định dạng` }, { status: 400 });
      if (file.size > MAX_BYTES) return NextResponse.json({ message: `File ${file.name} vượt quá 8MB` }, { status: 400 });
    }

    const reportDate = reportDateRaw ? new Date(reportDateRaw) : new Date();
    const created = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const freshness = await validateProgressPhotoFreshness(buffer, file.name);
      if (!freshness.ok) {
        return NextResponse.json({ message: freshness.message }, { status: 400 });
      }

      const fileHash = hashPhotoBuffer(buffer);
      const duplicate = await prisma.taskReportPhoto.findFirst({
        where: { fileHash },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            message: `Ảnh "${file.name}" đã được upload trước đó. Phải chụp ảnh mới tại hiện trường, không tái sử dụng ảnh cũ.`,
          },
          { status: 400 },
        );
      }

      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeFilename(file.name)}.${ext}`;
      const out = ext === "png" ? await sharp(buffer).png({ compressionLevel: 9 }).toBuffer() : ext === "webp" ? await sharp(buffer).webp({ quality: 88 }).toBuffer() : await sharp(buffer).jpeg({ quality: 88 }).toBuffer();
      const key = `reports/tasks/${params.id}/${reportType}/${filename}`;
      const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      await putObjectToMinio({ key, body: out, contentType });

      const row = await prisma.taskReportPhoto.create({
        data: {
          taskId: params.id,
          reportDate,
          type: reportType,
          technicalReportId: reportType === "technical" ? technicalReportId : null,
          fileUrl: `minio://${key}`,
          uploadedBy: user.id,
          takenAt: freshness.takenAt,
          fileHash,
        },
      });
      created.push(row);
    }

    if (created.length > 0) {
      const meta = await prisma.task.findUnique({ where: { id: params.id }, select: { code: true, name: true } });
      const totalSizeKb = files.reduce((sum, f) => sum + Math.ceil(f.size / 1024), 0);
      await logProjectActivity(prisma, {
        projectId: task.projectId,
        actorId: user.id,
        entity: "task_report_photo",
        entityId: params.id,
        action: "upload",
        summary: `Upload ${created.length} ảnh báo cáo ${reportType} task ${meta?.code} "${meta?.name}" (${(totalSizeKb / 1024).toFixed(2)} MB)`,
        metadata: { taskId: params.id, reportType, count: created.length, totalSizeKb, reportDate: reportDate.toISOString(), technicalReportId },
      });
    }

    return NextResponse.json({ photos: created, message: `Đã upload ${created.length} ảnh` }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || "Failed" }, { status: 500 });
  }
}
