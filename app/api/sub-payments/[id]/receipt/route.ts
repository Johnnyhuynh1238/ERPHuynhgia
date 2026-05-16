import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { putObjectToMinio } from "@/lib/minio";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { canMarkPaidSubPayment } from "@/lib/sub-payment-utils";

export const runtime = "nodejs";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function extFromType(type: string) {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic") return "heic";
  if (type === "image/heif") return "heif";
  return "jpg";
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (!canMarkPaidSubPayment(user.role)) {
    return NextResponse.json({ message: "Không có quyền upload phiếu chi" }, { status: 403 });
  }

  const payment = await prisma.subPayment.findUnique({
    where: { id: params.id },
    select: { id: true, subContractId: true },
  });

  if (!payment) {
    return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  }

  const access = await canUserAccessSubContract(payment.subContractId, { id: user.id, role: user.role });
  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const formData = await request.formData();
  const receipt = formData.get("receipt");
  if (!(receipt instanceof File)) {
    return NextResponse.json({ message: "Thiếu file phiếu chi" }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.includes(receipt.type)) {
    return NextResponse.json({ message: "Chỉ hỗ trợ ảnh jpg/png/webp/heic hoặc PDF" }, { status: 400 });
  }

  const bytes = await receipt.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return NextResponse.json({ message: "File quá lớn (tối đa 8MB)" }, { status: 400 });
  }

  const ext = extFromType(receipt.type);
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const key = `sub-payments/${payment.id}/receipts/${fileName}`;

  await putObjectToMinio({ key, body: Buffer.from(bytes), contentType: receipt.type });

  const url = `minio://${key}`;
  return NextResponse.json({ receiptUrl: url, message: "Đã upload phiếu chi" });
}
