import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";
import { getObjectFromMinio, putObjectToMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

export const runtime = "nodejs";

const ALLOWED_RECEIPT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;

function canEdit(role: UserRole) {
  return role === UserRole.admin || role === UserRole.accountant;
}

function canView(role: UserRole) {
  return role === UserRole.admin || role === UserRole.accountant || role === UserRole.construction_manager;
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "receipt";
}

function extFromType(type: string) {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic") return "heic";
  if (type === "image/heif") return "heif";
  return "jpg";
}

function minioKey(url: string | null) {
  return url?.startsWith("minio://") ? url.slice("minio://".length) : null;
}

function contentTypeFor(value: string) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const payment = await prisma.paymentSchedule.findUnique({
    where: { id: params.id },
    select: { id: true, projectId: true, installmentNo: true, phaseNumber: true, description: true, milestoneDescription: true, receiptUrl: true },
  });
  if (!payment?.receiptUrl) return NextResponse.json({ message: "Không tìm thấy biên lai" }, { status: 404 });

  const token = new URL(request.url).searchParams.get("token");
  if (token) {
    const access = await requireCustomerPortalApiAccess(token);
    if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });
    if (access.project.id !== payment.projectId) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  } else {
    const user = await getCurrentUser();
    if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    if (!canView(user.role as UserRole)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    const project = await prisma.project.findFirst({
      where: { id: payment.projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const key = minioKey(payment.receiptUrl);
  if (!key) return NextResponse.redirect(payment.receiptUrl);
  const file = await getObjectFromMinio(key);
  const filename = safeFilename(`${payment.installmentNo || payment.phaseNumber}_${payment.description || payment.milestoneDescription || "bien_lai"}`);
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "content-type": file.contentType || contentTypeFor(key),
      "content-disposition": `inline; filename="${filename}"`,
    },
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEdit(user.role as UserRole)) return NextResponse.json({ message: "Không có quyền upload biên lai" }, { status: 403 });

  const payment = await prisma.paymentSchedule.findUnique({ where: { id: params.id }, select: { id: true, projectId: true } });
  if (!payment) return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });

  const project = await prisma.project.findFirst({
    where: { id: payment.projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const formData = await request.formData();
  const receipt = formData.get("receipt");
  if (!(receipt instanceof File)) return NextResponse.json({ message: "Thiếu file biên lai" }, { status: 400 });
  if (!ALLOWED_RECEIPT_TYPES.includes(receipt.type)) return NextResponse.json({ message: "Chỉ hỗ trợ PDF hoặc ảnh biên lai" }, { status: 400 });
  if (receipt.size > MAX_RECEIPT_BYTES) return NextResponse.json({ message: "File biên lai tối đa 12MB" }, { status: 400 });

  const uploadedName = safeFilename(receipt.name);
  const ext = uploadedName.includes(".") ? uploadedName.split(".").pop() || extFromType(receipt.type) : extFromType(receipt.type);
  const baseName = uploadedName.replace(/\.[^.]+$/, "") || "receipt";
  const key = `projects/${payment.projectId}/payments/${payment.id}/receipts/${randomUUID()}_${baseName}.${ext}`;
  const buffer = Buffer.from(await receipt.arrayBuffer());
  await putObjectToMinio({ key, body: buffer, contentType: receipt.type || "application/octet-stream" });

  return NextResponse.json({ receiptUrl: `minio://${key}`, message: "Đã upload biên lai" });
}
