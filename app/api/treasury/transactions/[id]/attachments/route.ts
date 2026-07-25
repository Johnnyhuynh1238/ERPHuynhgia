import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ROLES_EDIT = new Set<string>([UserRole.admin, UserRole.accountant]);

// PATCH: kế toán/admin gắn (bổ sung) ảnh chứng từ thẳng vào 1 phiếu sổ quỹ.
// Body { attachmentUrls: string[] } — danh sách đầy đủ sau khi thêm/xoá (tối đa 20).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ROLES_EDIT.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { attachmentUrls?: unknown };
  const raw = Array.isArray(body?.attachmentUrls) ? body.attachmentUrls : null;
  if (!raw) return NextResponse.json({ message: "Thiếu danh sách ảnh" }, { status: 400 });

  const urls = raw
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 20);

  const txn = await prisma.cashTransaction.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!txn) return NextResponse.json({ message: "Không tìm thấy phiếu" }, { status: 404 });

  await prisma.cashTransaction.update({ where: { id: txn.id }, data: { attachmentUrls: urls } });

  return NextResponse.json({ ok: true, attachmentUrls: urls });
}
