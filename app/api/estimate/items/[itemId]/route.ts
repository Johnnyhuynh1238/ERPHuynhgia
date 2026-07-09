import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteObjectFromMinio } from "@/lib/minio";
import { requireAdmin, type EstimateDrawing } from "@/lib/estimate";

export const runtime = "nodejs";

// PATCH: sửa nội dung hạng mục.
// body {name?, method?, materialSpec?, dimensions?} | {move: "up"|"down"}
// method = ô Mô tả duy nhất trên tab; materialSpec/dimensions là cột cũ (vẫn nhận nếu có).
export async function PATCH(req: Request, { params }: { params: { itemId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const item = await prisma.estimateItem.findUnique({ where: { id: params.itemId } });
  if (!item) return NextResponse.json({ message: "Không tìm thấy hạng mục" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.move === "up" || body.move === "down") {
    const dir = body.move === "up" ? "lt" : "gt";
    const neighbor = await prisma.estimateItem.findFirst({
      where: { groupId: item.groupId, sortOrder: { [dir]: item.sortOrder } },
      orderBy: { sortOrder: body.move === "up" ? "desc" : "asc" },
    });
    if (neighbor) {
      await prisma.$transaction([
        prisma.estimateItem.update({ where: { id: item.id }, data: { sortOrder: neighbor.sortOrder } }),
        prisma.estimateItem.update({ where: { id: neighbor.id }, data: { sortOrder: item.sortOrder } }),
      ]);
    }
    return NextResponse.json({ ok: true });
  }

  const data: Record<string, unknown> = {};
  for (const field of ["name", "method", "materialSpec", "dimensions"] as const) {
    if (field in body) {
      const v = String(body[field] ?? "").trim();
      if (field === "name" && !v) return NextResponse.json({ message: "Tên hạng mục không được rỗng" }, { status: 400 });
      data[field] = v || null;
    }
  }
  // fields: thông tin riêng [{label, value}] — chỉ giữ dòng có nhãn
  if (Array.isArray(body.fields)) {
    data.fields = (body.fields as unknown[])
      .map((f) => (f && typeof f === "object" ? f as { label?: unknown; value?: unknown } : { label: "", value: "" }))
      .map((f) => ({ label: String(f.label ?? "").trim(), value: String(f.value ?? "").trim() }))
      .filter((f) => f.label);
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ message: "Không có gì để sửa" }, { status: 400 });

  await prisma.estimateItem.update({ where: { id: item.id }, data });
  return NextResponse.json({ ok: true });
}

// DELETE: xoá hạng mục + line (cascade) + ảnh trên minio
export async function DELETE(_req: Request, { params }: { params: { itemId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const item = await prisma.estimateItem.findUnique({ where: { id: params.itemId }, select: { id: true, drawings: true } });
  if (!item) return NextResponse.json({ ok: true });

  await prisma.estimateItem.delete({ where: { id: item.id } });
  for (const d of (item.drawings as EstimateDrawing[]) ?? []) {
    await deleteObjectFromMinio(d.key).catch(() => null);
  }
  return NextResponse.json({ ok: true });
}
