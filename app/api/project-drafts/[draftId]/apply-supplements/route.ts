import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PaymentScheduleType, ProjectAiAuditAction } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { getObjectFromMinio, putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const applySchema = z.object({
  projectId: z.string().uuid().optional(),
});

const paymentItemSchema = z.object({
  type: z.enum(["contract", "addendum"]).optional().default("addendum"),
  installmentNo: z.coerce.number().int().min(1).optional(),
  description: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const drawingItemSchema = z.object({
  draftFileId: z.string().uuid().optional(),
  fileId: z.string().uuid().optional(),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  displayOrder: z.coerce.number().int().optional().default(0),
});

type DraftFormData = Record<string, unknown>;

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

function normalizeDate(raw: string) {
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function dayDiff(from: Date, to: Date) {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function minioKey(url: string) {
  return url.startsWith("minio://") ? url.slice("minio://".length) : null;
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "drawing.pdf";
}

function formArray(formData: DraftFormData, key: string) {
  const value = formData[key];
  return Array.isArray(value) ? value : [];
}

export async function POST(request: Request, { params }: { params: { draftId: string } }) {
  let current;
  try {
    current = await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const draft = await prisma.projectChangeDraft.findUnique({
    where: { id: params.draftId },
    include: { files: true },
  });
  if (!draft) return NextResponse.json({ message: "Không tìm thấy bản nháp" }, { status: 404 });

  if (draft.projectId && parsed.data.projectId && parsed.data.projectId !== draft.projectId) {
    return NextResponse.json({ message: "Bản nháp không thuộc dự án được chọn" }, { status: 400 });
  }

  const projectId = parsed.data.projectId || draft.projectId;
  if (!projectId) return NextResponse.json({ message: "Cần projectId để ghi dữ liệu bổ sung chính thức" }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, startDate: true, contractValue: true },
  });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const formData = (draft.formData && typeof draft.formData === "object" && !Array.isArray(draft.formData)
    ? draft.formData
    : {}) as DraftFormData;
  const paymentItems = formArray(formData, "paymentSchedules").map((item) => paymentItemSchema.safeParse(item)).filter((item) => item.success).map((item) => item.data);
  const drawingItems = formArray(formData, "drawings").map((item) => drawingItemSchema.safeParse(item)).filter((item) => item.success).map((item) => item.data);

  const existingPaymentCount = await prisma.paymentSchedule.count({ where: { projectId } });
  const createdPayments = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (let idx = 0; idx < paymentItems.length; idx += 1) {
      const item = paymentItems[idx];
      const dueDate = normalizeDate(item.dueDate);
      const installmentNo = item.installmentNo || existingPaymentCount + idx + 1;
      const paymentType = existingPaymentCount > 0 ? PaymentScheduleType.addendum : item.type === "contract" ? PaymentScheduleType.contract : PaymentScheduleType.addendum;
      const percent = project.contractValue && Number(project.contractValue) > 0 ? Math.round((item.amount / Number(project.contractValue)) * 10000) / 100 : 0;
      const existingPayment = await tx.paymentSchedule.findFirst({
        where: {
          projectId,
          amount: item.amount,
          dueDate,
          description: item.description,
        },
      });
      if (existingPayment) continue;

      const row = await tx.paymentSchedule.create({
        data: {
          projectId,
          phaseNumber: installmentNo,
          milestoneDescription: item.description,
          percent,
          amount: item.amount,
          expectedDate: dueDate,
          dayOffset: dayDiff(project.startDate, dueDate),
          type: paymentType,
          installmentNo,
          description: item.description,
          dueDate,
          createdBy: current.id,
        },
      });
      rows.push(row);
    }
    return rows;
  });

  const drawingFiles = draft.files.filter((file) => file.fileKind === "drawing" && file.mimeType === "application/pdf");
  const createdDrawings = [];
  for (let idx = 0; idx < drawingItems.length; idx += 1) {
    const item = drawingItems[idx];
    const draftFileId = item.draftFileId || item.fileId || (drawingFiles.length === 1 ? drawingFiles[0].id : undefined);
    const draftFile = draft.files.find((file) => file.id === draftFileId && file.fileKind === "drawing" && file.mimeType === "application/pdf");
    if (!draftFile) continue;

    const sourceKey = minioKey(draftFile.fileUrl);
    if (!sourceKey) continue;

    const name = item.name || draftFile.fileName;
    const existingDrawing = await prisma.projectDrawing.findFirst({ where: { projectId, name, fileSizeBytes: draftFile.fileSize } });
    if (existingDrawing) continue;

    const id = randomUUID();
    const object = await getObjectFromMinio(sourceKey);
    const key = `projects/${projectId}/drawings/${id}_${safeFilename(draftFile.fileName)}`;
    await putObjectToMinio({ key, body: object.buffer, contentType: object.contentType || "application/pdf" });

    const drawing = await prisma.projectDrawing.create({
      data: {
        id,
        projectId,
        name,
        description: item.description || null,
        fileUrl: `minio://${key}`,
        fileSizeBytes: draftFile.fileSize,
        displayOrder: item.displayOrder ?? idx,
        uploadedBy: current.id,
      },
    });
    createdDrawings.push(drawing);
  }

  await prisma.projectAiAudit.create({
    data: {
      draftId: draft.id,
      actorId: current.id,
      action: ProjectAiAuditAction.submit_update,
      payload: {
        projectId,
        createdPaymentCount: createdPayments.length,
        createdDrawingCount: createdDrawings.length,
      },
    },
  });

  return NextResponse.json({
    payments: createdPayments,
    drawings: createdDrawings,
    message: `Đã ghi bổ sung ${createdPayments.length} lịch thanh toán và ${createdDrawings.length} bản vẽ`,
  });
}
