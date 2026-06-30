import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { putObjectToMinio } from "@/lib/minio";

export const runtime = "nodejs";

const RECEIVER_ROLES = new Set<string>([
  UserRole.engineer,
  UserRole.construction_manager,
  UserRole.admin,
]);

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const MAX_PHOTOS_PER_ITEM = 10;

type StoredPhoto = { key: string; contentType: string; width: number | null; height: number | null };

function safeBaseName(name: string) {
  return (
    (name || "img")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.(jpe?g|png|webp)$/i, "")
      .slice(0, 60) || "img"
  );
}

function readFiles(formData: FormData) {
  return [...formData.getAll("file"), ...formData.getAll("files")].filter(
    (x): x is File => x instanceof File,
  );
}

async function getReceipt(proposalId: string, itemSeq: number) {
  return prisma.materialProposalItemReceipt.findUnique({
    where: { proposalId_itemSeq: { proposalId, itemSeq } },
    select: { id: true, photos: true, proposal: { select: { closedAt: true } } },
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; seq: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!RECEIVER_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const seq = Number(params.seq);
  if (!Number.isInteger(seq) || seq < 0) {
    return NextResponse.json({ message: "Sai chỉ số dòng" }, { status: 400 });
  }

  const receipt = await getReceipt(params.id, seq);
  if (!receipt) {
    return NextResponse.json({ message: "Lưu số lượng nhận trước khi up ảnh" }, { status: 400 });
  }
  if (receipt.proposal.closedAt) {
    return NextResponse.json({ message: "PO đã đóng" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: "Form không hợp lệ" }, { status: 400 });
  }
  const files = readFiles(formData);
  if (!files.length) return NextResponse.json({ message: "Chọn ít nhất 1 ảnh" }, { status: 400 });
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ message: `Tối đa ${MAX_FILES_PER_REQUEST} ảnh / lần` }, { status: 400 });
  }
  for (const f of files) {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return NextResponse.json({ message: `${f.name}: không phải JPG/PNG/WEBP` }, { status: 400 });
    }
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ message: `${f.name}: vượt 25MB` }, { status: 400 });
    }
  }

  const existing = ((receipt.photos as unknown as StoredPhoto[]) || []).slice();
  if (existing.length + files.length > MAX_PHOTOS_PER_ITEM) {
    return NextResponse.json(
      { message: `Mỗi mặt hàng tối đa ${MAX_PHOTOS_PER_ITEM} ảnh (hiện có ${existing.length})` },
      { status: 400 },
    );
  }

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // ignore
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `proposal-receipts/${params.id}/${seq}/${randomUUID()}-${safeBaseName(file.name)}.${ext}`;
    await putObjectToMinio({ key, body: buffer, contentType: file.type });
    existing.push({ key, contentType: file.type, width, height });
  }

  await prisma.materialProposalItemReceipt.update({
    where: { id: receipt.id },
    data: { photos: existing as unknown as Prisma.InputJsonValue },
  });
  return NextResponse.json({ ok: true, photos: existing });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; seq: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!RECEIVER_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const seq = Number(params.seq);
  if (!Number.isInteger(seq) || seq < 0) {
    return NextResponse.json({ message: "Sai chỉ số dòng" }, { status: 400 });
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return NextResponse.json({ message: "Thiếu key ảnh" }, { status: 400 });

  const receipt = await getReceipt(params.id, seq);
  if (!receipt) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (receipt.proposal.closedAt) {
    return NextResponse.json({ message: "PO đã đóng" }, { status: 400 });
  }
  const photos = ((receipt.photos as unknown as StoredPhoto[]) || []).filter((p) => p.key !== key);
  await prisma.materialProposalItemReceipt.update({
    where: { id: receipt.id },
    data: { photos: photos as unknown as Prisma.InputJsonValue },
  });
  return NextResponse.json({ ok: true, photos });
}
