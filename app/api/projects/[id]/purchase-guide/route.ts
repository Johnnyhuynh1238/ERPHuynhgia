import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

const MODES = new Set(["khach_cap", "doi", "them"]);
const opt = (v: unknown, max = 4000) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

// PUT: lưu điều chỉnh theo phụ lục HĐ cho 1 dòng/hạng mục (upsert theo item_key).
// itemKey rỗng + mode "them" → tạo VT thêm mới (extra|uuid). Chỉ admin.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = String(b.mode || "");
  if (!MODES.has(mode)) return NextResponse.json({ message: "Loại điều chỉnh không hợp lệ" }, { status: 400 });

  let itemKey = opt(b.itemKey, 400);
  if (!itemKey) {
    if (mode !== "them") return NextResponse.json({ message: "Thiếu dòng cần điều chỉnh" }, { status: 400 });
    itemKey = `extra|${randomUUID()}`;
  }
  const data = {
    mode,
    groupName: opt(b.groupName, 300),
    ten: opt(b.ten, 300),
    loai: opt(b.loai),
    quycach: opt(b.quycach),
    note: opt(b.note),
    source: opt(b.source, 120),
    updatedBy: user!.id,
  };
  if (mode === "them" && !data.ten) return NextResponse.json({ message: "Nhập tên vật tư" }, { status: 400 });
  if (mode === "doi" && !data.loai && !data.quycach)
    return NextResponse.json({ message: "Nhập chủng loại hoặc quy cách mới" }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const row = await prisma.purchaseGuideAdjust.upsert({
    where: { projectId_itemKey: { projectId: params.id, itemKey } },
    create: { projectId: params.id, itemKey, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true, itemKey: row.itemKey });
}

// DELETE ?itemKey=… : bỏ điều chỉnh (dòng quay về theo phụ lục gốc; VT thêm mới thì xoá hẳn).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const itemKey = new URL(req.url).searchParams.get("itemKey") || "";
  if (!itemKey) return NextResponse.json({ message: "Thiếu itemKey" }, { status: 400 });
  await prisma.purchaseGuideAdjust.deleteMany({ where: { projectId: params.id, itemKey } });
  return NextResponse.json({ ok: true });
}
