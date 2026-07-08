import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteObjectFromMinio, getObjectFromMinio } from "@/lib/minio";
import { requireAdmin, type EstimateDrawing } from "@/lib/estimate";

export const runtime = "nodejs";

async function loadItem(itemId: string) {
  return prisma.estimateItem.findUnique({ where: { id: itemId }, select: { id: true, drawings: true } });
}

// GET: stream ảnh/PDF bản vẽ theo index trong mảng drawings
export async function GET(_req: Request, { params }: { params: { itemId: string; idx: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const item = await loadItem(params.itemId);
  const drawings = ((item?.drawings as EstimateDrawing[]) ?? []);
  const d = drawings[Number(params.idx)];
  if (!d) return NextResponse.json({ message: "Không có file" }, { status: 404 });

  const obj = await getObjectFromMinio(d.key);
  return new NextResponse(new Uint8Array(obj.buffer), {
    headers: {
      "Content-Type": obj.contentType || d.type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// DELETE: gỡ file khỏi hạng mục + xoá trên minio
export async function DELETE(_req: Request, { params }: { params: { itemId: string; idx: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const item = await loadItem(params.itemId);
  if (!item) return NextResponse.json({ message: "Không tìm thấy hạng mục" }, { status: 404 });

  const drawings = ((item.drawings as EstimateDrawing[]) ?? []);
  const idx = Number(params.idx);
  const removed = drawings[idx];
  if (!removed) return NextResponse.json({ message: "Không có file" }, { status: 404 });

  const next = drawings.filter((_, i) => i !== idx);
  await prisma.estimateItem.update({ where: { id: item.id }, data: { drawings: next } });
  await deleteObjectFromMinio(removed.key).catch(() => null);
  return NextResponse.json({ drawings: next });
}
