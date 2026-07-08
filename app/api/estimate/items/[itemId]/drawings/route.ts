import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { putObjectToMinio } from "@/lib/minio";
import { requireAdmin, type EstimateDrawing } from "@/lib/estimate";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 12 * 1024 * 1024;

function extFromType(type: string) {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

// POST: upload 1 ảnh/PDF bản vẽ, append vào drawings của hạng mục
export async function POST(req: Request, { params }: { params: { itemId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const item = await prisma.estimateItem.findUnique({
    where: { id: params.itemId },
    select: { id: true, drawings: true, group: { select: { projectId: true } } },
  });
  if (!item) return NextResponse.json({ message: "Không tìm thấy hạng mục" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Thiếu file" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ message: "Chỉ hỗ trợ jpg/png/webp hoặc PDF" }, { status: 400 });
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return NextResponse.json({ message: "File quá lớn (tối đa 12MB)" }, { status: 400 });

  const key = `estimate/${item.group.projectId}/${Date.now()}-${crypto.randomUUID()}.${extFromType(file.type)}`;
  await putObjectToMinio({ key, body: Buffer.from(bytes), contentType: file.type });

  const drawings = [...(((item.drawings as EstimateDrawing[]) ?? [])), { key, name: file.name, type: file.type }];
  await prisma.estimateItem.update({ where: { id: item.id }, data: { drawings } });
  return NextResponse.json({ drawings });
}
