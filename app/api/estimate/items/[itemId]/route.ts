import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteObjectFromMinio } from "@/lib/minio";
import { requireAdmin, type EstimateDrawing } from "@/lib/estimate";
import { getTemplate, renderFormText } from "@/lib/estimate-templates";

export const runtime = "nodejs";

// PATCH: sửa nội dung hạng mục.
// body {name?, method?, materialSpec?, dimensions?} | {move: "up"|"down"}
// | {formData: {...}} — lưu form mẫu: ghi formData + render text vào 3 cột
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

  if (body.formData && typeof body.formData === "object") {
    if (!item.templateKey || !getTemplate(item.templateKey)) {
      return NextResponse.json({ message: "Hạng mục không có form mẫu" }, { status: 400 });
    }
    const text = renderFormText(item.templateKey, body.formData as Record<string, unknown>);
    await prisma.estimateItem.update({
      where: { id: item.id },
      data: {
        formData: body.formData,
        method: text?.method || null,
        materialSpec: text?.materialSpec || null,
        dimensions: text?.dimensions || null,
      },
    });
    return NextResponse.json({ ok: true });
  }

  const data: Record<string, string | null> = {};
  for (const field of ["name", "method", "materialSpec", "dimensions"] as const) {
    if (field in body) {
      const v = String(body[field] ?? "").trim();
      if (field === "name" && !v) return NextResponse.json({ message: "Tên hạng mục không được rỗng" }, { status: 400 });
      data[field] = v || null;
    }
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
