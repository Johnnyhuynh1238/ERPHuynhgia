import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditEod } from "@/lib/eod";
import { putObjectToMinio } from "@/lib/minio";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 8;

function safeBaseName(name: string) {
  return (name || "output").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.(jpe?g|png|webp)$/i, "").slice(0, 60) || "output";
}

function readFiles(formData: FormData) {
  return [...formData.getAll("file"), ...formData.getAll("files")].filter((x): x is File => x instanceof File);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditEod({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: "Dữ liệu form không hợp lệ" }, { status: 400 });
  }

  const outputId = String(formData.get("outputId") || "");
  if (!outputId) return NextResponse.json({ message: "Thiếu outputId" }, { status: 400 });

  const output = await prisma.workOrderOutput.findFirst({
    where: { id: outputId, projectId: params.id },
    select: { id: true, date: true },
  });
  if (!output) return NextResponse.json({ message: "Không tìm thấy sản lượng" }, { status: 404 });

  const files = readFiles(formData);
  if (files.length === 0) return NextResponse.json({ message: "Chọn ít nhất 1 ảnh" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ message: `Tối đa ${MAX_FILES} ảnh mỗi lần` }, { status: 400 });
  for (const f of files) {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return NextResponse.json({ message: `File ${f.name} không phải ảnh JPG/PNG/WEBP` }, { status: 400 });
    }
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ message: `File ${f.name} vượt 25MB` }, { status: 400 });
    }
  }

  const orderAgg = await prisma.workOrderOutputPhoto.aggregate({
    where: { outputId: output.id },
    _max: { sortRank: true },
  });
  let nextRank = (orderAgg._max.sortRank ?? -1) + 1;

  const dateStr = output.date.toISOString().slice(0, 10);
  const created: Array<{ id: string; storageKey: string; sortRank: number }> = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // bỏ qua nếu sharp không đọc được metadata, vẫn lưu file
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `eod/${params.id}/${dateStr}/${output.id}/${randomUUID()}-${safeBaseName(file.name)}.${ext}`;
    await putObjectToMinio({ key, body: buffer, contentType: file.type });

    const photo = await prisma.workOrderOutputPhoto.create({
      data: {
        outputId: output.id,
        storageKey: key,
        width,
        height,
        sizeBytes: file.size,
        contentType: file.type,
        sortRank: nextRank,
        uploadedById: user.id,
      },
      select: { id: true, storageKey: true, sortRank: true },
    });
    created.push(photo);
    nextRank += 1;
  }

  return NextResponse.json({ ok: true, photos: created });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditEod({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const photoId = url.searchParams.get("photoId");
  if (!photoId) return NextResponse.json({ message: "Thiếu photoId" }, { status: 400 });

  const photo = await prisma.workOrderOutputPhoto.findFirst({
    where: { id: photoId, output: { projectId: params.id } },
    select: { id: true, storageKey: true },
  });
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  await prisma.workOrderOutputPhoto.delete({ where: { id: photo.id } });
  // Không xoá MinIO ngay để recover được nếu cần; lifecycle có thể quét sau
  return NextResponse.json({ ok: true });
}
