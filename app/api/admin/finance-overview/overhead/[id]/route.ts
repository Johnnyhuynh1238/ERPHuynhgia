import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { overheadSchema } from "../schema";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return null;
}

// Sửa 1 khoản chi phí chung.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = overheadSchema.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const data = { ...parsed.data, ...(parsed.data.note !== undefined ? { note: parsed.data.note || null } : {}) };
  const res = await prisma.companyOverheadItem.updateMany({ where: { id: params.id }, data });
  if (!res.count) return NextResponse.json({ message: "Không tìm thấy khoản này" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// Xoá 1 khoản chi phí chung.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await prisma.companyOverheadItem.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
