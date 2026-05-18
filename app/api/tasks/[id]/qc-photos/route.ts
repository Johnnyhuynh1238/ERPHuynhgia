import sharp from "sharp";
import { NextResponse } from "next/server";
import { QcLogAction, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTaskWithAccess } from "@/lib/task-permissions";
import { putObjectToMinio } from "@/lib/minio";
import { logProjectActivity } from "@/lib/project-activity-log";

const createSchema = z.object({
  qcItemId: z.string().uuid("qcItemId không hợp lệ"),
  urls: z.array(z.string().min(1)).min(1, "Cần ít nhất 1 ảnh"),
});

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function canHandleQcPhoto(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager || role === UserRole.engineer;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  if (!canHandleQcPhoto(user.role)) {
    return NextResponse.json({ message: "Không có quyền upload ảnh QC" }, { status: 403 });
  }

  let qcItemId = "";
  let urls: string[] = [];

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    qcItemId = String(formData.get("qcItemId") || "").trim();
    const files = formData.getAll("files").filter((f) => f instanceof File) as File[];

    if (!qcItemId) {
      return NextResponse.json({ message: "Thiếu qcItemId" }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json({ message: "Vui lòng chọn ít nhất 1 ảnh" }, { status: 400 });
    }

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ message: `File ${file.name} không đúng định dạng ảnh` }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ message: `File ${file.name} vượt quá 8MB` }, { status: 400 });
      }
    }

    for (const file of files) {
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

      const key = `qc/tasks/${params.id}/${qcItemId}/${filename}`;
      const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      await putObjectToMinio({ key, body: outputBuffer, contentType });

      urls.push(`minio://${key}`);
    }
  } else {
    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    qcItemId = parsed.data.qcItemId;
    urls = parsed.data.urls;
  }

  const item = await prisma.qcItem.findFirst({
    where: { id: qcItemId, taskId: params.id },
    select: { id: true, content: true },
  });

  if (!item) {
    return NextResponse.json({ message: "Không tìm thấy mục QC" }, { status: 404 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const rows = await Promise.all(
      urls.map((url) =>
        tx.qcPhoto.create({
          data: {
            qcItemId: item.id,
            taskId: params.id,
            url,
            uploadedBy: user.id,
          },
        }),
      ),
    );

    await tx.qcLog.create({
      data: {
        taskId: params.id,
        qcItemId: item.id,
        action: QcLogAction.photo_added,
        note: `Upload ${rows.length} ảnh QC`,
        performedBy: user.id,
      },
    });

    const meta = await tx.task.findUnique({ where: { id: params.id }, select: { code: true, name: true } });
    await logProjectActivity(tx, {
      projectId: task.projectId,
      actorId: user.id,
      entity: "task_qc_photo",
      entityId: item.id,
      action: "upload",
      summary: `Upload ${rows.length} ảnh QC mục "${item.content ?? ''}" task ${meta?.code} "${meta?.name}"`,
      metadata: { taskId: params.id, qcItemId: item.id, count: rows.length },
    });

    return rows;
  });

  return NextResponse.json({ photos: created, message: `Đã upload ${created.length} ảnh QC` }, { status: 201 });
}
