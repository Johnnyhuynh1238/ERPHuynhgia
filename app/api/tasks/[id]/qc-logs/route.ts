import sharp from "sharp";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { canUpdateQc, getTaskWithAccess } from "@/lib/task-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";

const createSchema = z.object({
  qcItemId: z.string().uuid("qcItemId không hợp lệ"),
  eveningReportId: z.string().uuid().optional().nullable(),
  photos: z.array(z.string().min(1)).optional().default([]),
  note: z.string().optional().nullable(),
});

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}


export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  if (!canUpdateQc(task, { id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền check QC" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const qcItemId = String(formData.get("qcItemId") || "").trim();
    const eveningReportIdInput = String(formData.get("eveningReportId") || "").trim();
    const noteInput = String(formData.get("note") || "").trim();
    const files = formData.getAll("files").filter((f) => f instanceof File) as File[];

    if (!qcItemId) return NextResponse.json({ message: "Thiếu qcItemId" }, { status: 400 });

    const item = await prisma.qcItem.findFirst({ where: { id: qcItemId, taskId: params.id }, select: { id: true } });
    if (!item) return NextResponse.json({ message: "Không tìm thấy mục QC" }, { status: 404 });

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ message: `File ${file.name} không đúng định dạng ảnh` }, { status: 400 });
      if (file.size > MAX_BYTES) return NextResponse.json({ message: `File ${file.name} vượt quá 8MB` }, { status: 400 });
    }

    const photos: string[] = [];
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
      const key = `qc-logs/tasks/${params.id}/${qcItemId}/${filename}`;
      const outType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      await putObjectToMinio({ key, body: outputBuffer, contentType: outType });
      photos.push(`minio://${key}`);
    }

    const created = await prisma.taskQcLog.create({
      data: {
        taskId: params.id,
        qcItemId,
        eveningReportId: eveningReportIdInput || null,
        checkedBy: user.id,
        photos,
        note: noteInput || null,
      },
      include: {
        qcItem: { select: { id: true, content: true } },
        checker: { select: { id: true, fullName: true, email: true } },
      },
    });

    const meta = await prisma.task.findUnique({ where: { id: params.id }, select: { code: true, name: true } });
    await logProjectActivity(prisma, {
      projectId: task.projectId,
      actorId: user.id,
      entity: "task_qc_log",
      entityId: created.id,
      action: "create",
      summary: `Check QC mục "${created.qcItem?.content ?? ''}" task ${meta?.code} "${meta?.name}"`,
      metadata: { taskId: params.id, qcItemId, photoCount: photos.length, hasNote: Boolean(noteInput), eveningReportId: eveningReportIdInput || null },
    });

    return NextResponse.json({ log: created }, { status: 201 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });

  const item = await prisma.qcItem.findFirst({ where: { id: parsed.data.qcItemId, taskId: params.id }, select: { id: true } });
  if (!item) return NextResponse.json({ message: "Không tìm thấy mục QC" }, { status: 404 });

  const created = await prisma.taskQcLog.create({
    data: {
      taskId: params.id,
      qcItemId: parsed.data.qcItemId,
      eveningReportId: parsed.data.eveningReportId || null,
      checkedBy: user.id,
      photos: parsed.data.photos,
      note: parsed.data.note?.trim() || null,
    },
    include: {
      qcItem: { select: { id: true, content: true } },
      checker: { select: { id: true, fullName: true, email: true } },
    },
  });

  const meta2 = await prisma.task.findUnique({ where: { id: params.id }, select: { code: true, name: true } });
  await logProjectActivity(prisma, {
    projectId: task.projectId,
    actorId: user.id,
    entity: "task_qc_log",
    entityId: created.id,
    action: "create",
    summary: `Check QC mục "${created.qcItem?.content ?? ''}" task ${meta2?.code} "${meta2?.name}"`,
    metadata: { taskId: params.id, qcItemId: parsed.data.qcItemId, photoCount: parsed.data.photos.length, hasNote: Boolean(parsed.data.note?.trim()), eveningReportId: parsed.data.eveningReportId || null },
  });

  return NextResponse.json({ log: created }, { status: 201 });
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  const where: { taskId: string; checkedAt?: { gte: Date; lt: Date } } = { taskId: params.id };
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const to = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
    where.checkedAt = { gte: from, lt: to };
  }

  const logs = await prisma.taskQcLog.findMany({
    where,
    orderBy: [{ checkedAt: "desc" }],
    include: {
      qcItem: { select: { id: true, content: true } },
      checker: { select: { id: true, fullName: true, email: true } },
    },
  });

  const grouped = logs.reduce<Record<string, typeof logs>>((acc, log) => {
    const key = log.checkedAt.toISOString().slice(0, 10);
    if (!acc[key]) acc[key] = [];
    acc[key].push(log);
    return acc;
  }, {});

  return NextResponse.json({ logs, groupedByDate: grouped });
}
