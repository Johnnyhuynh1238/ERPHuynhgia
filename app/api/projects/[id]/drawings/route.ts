import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

export const runtime = "nodejs";

const MAX_PDF_BYTES = 50 * 1024 * 1024;

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "drawing.pdf";
}

function canViewDrawings(role: UserRole) {
  return role === UserRole.admin || role === UserRole.accountant || role === UserRole.construction_manager || role === UserRole.engineer;
}

function drawingViewUrl(id: string) {
  return `/api/drawings/${id}/file`;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewDrawings(user.role as UserRole)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const drawings = await prisma.projectDrawing.findMany({
    where: { projectId: params.id },
    orderBy: [{ displayOrder: "asc" }, { uploadedAt: "desc" }],
    include: { uploader: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json({ drawings: drawings.map((row) => ({ ...row, viewUrl: drawingViewUrl(row.id) })) });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) return NextResponse.json({ message: "Chỉ admin được upload bản vẽ" }, { status: 403 });

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const displayOrder = Number(formData.get("displayOrder") || 0);

  if (!name) return NextResponse.json({ message: "Tên bản vẽ là bắt buộc" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ message: "File PDF là bắt buộc" }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ message: "Chỉ hỗ trợ file PDF" }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return NextResponse.json({ message: "File PDF tối đa 50MB" }, { status: 400 });

  const id = randomUUID();
  const key = `projects/${params.id}/drawings/${id}_${safeFilename(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await putObjectToMinio({ key, body: buffer, contentType: "application/pdf" });

  const drawing = await prisma.projectDrawing.create({
    data: {
      id,
      projectId: params.id,
      name,
      description: description || null,
      fileUrl: `minio://${key}`,
      fileSizeBytes: file.size,
      displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
      uploadedBy: user.id,
    },
    include: { uploader: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json({ drawing: { ...drawing, viewUrl: drawingViewUrl(drawing.id) }, message: "Đã upload bản vẽ" });
}
