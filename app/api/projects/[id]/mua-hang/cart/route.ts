import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMuaHang } from "@/lib/estimate";

export const runtime = "nodejs";

// Giỏ hàng lưu server, theo (dự án, người dùng). AI + UI dùng chung.
// Tên gốc VT (bỏ " (quy cách…)") — khớp cách gộp ở màn mua hàng + trần dự toán.
const baseName = (n: string) => {
  const i = n.indexOf(" (");
  return (i >= 0 ? n.slice(0, i) : n).trim();
};
const matKey = (name: string, unit: string) => `${baseName(name)}|${unit.trim()}`;

type CartRow = { key: string; name: string; unit: string; qty: number; price: number };

async function readCart(projectId: string, userId: string): Promise<CartRow[]> {
  const rows = await prisma.mhCartItem.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: "asc" },
    select: { key: true, name: true, unit: true, qty: true, price: true },
  });
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    unit: r.unit,
    qty: Number(r.qty),
    price: Number(r.price),
  }));
}

// GET: giỏ của người dùng hiện tại cho dự án.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireMuaHang();
  if (error) return error;
  const items = await readCart(params.id, user!.id);
  return NextResponse.json({ items });
}

// PUT: thêm/cập nhật 1 vật tư trong giỏ. qty<=0 → gỡ khỏi giỏ. Trả về giỏ mới.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireMuaHang();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  const unit = String(body.unit || "").trim();
  const qty = Number(body.qty);
  const price = Math.max(0, Math.round(Number(body.price) || 0));
  if (!name || !unit) {
    return NextResponse.json({ message: "Thiếu tên hàng / đơn vị" }, { status: 400 });
  }
  const key = String(body.key || matKey(name, unit));

  if (!(qty > 0)) {
    await prisma.mhCartItem.deleteMany({ where: { projectId: params.id, userId: user!.id, key } });
  } else {
    await prisma.mhCartItem.upsert({
      where: { projectId_userId_key: { projectId: params.id, userId: user!.id, key } },
      create: { projectId: params.id, userId: user!.id, key, name, unit, qty, price },
      update: { name, unit, qty, price },
    });
  }
  const items = await readCart(params.id, user!.id);
  return NextResponse.json({ items });
}

// DELETE: xoá 1 vật tư (?key=...) hoặc cả giỏ. Trả về giỏ mới.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireMuaHang();
  if (error) return error;

  const key = new URL(req.url).searchParams.get("key");
  await prisma.mhCartItem.deleteMany({
    where: { projectId: params.id, userId: user!.id, ...(key ? { key } : {}) },
  });
  const items = await readCart(params.id, user!.id);
  return NextResponse.json({ items });
}
