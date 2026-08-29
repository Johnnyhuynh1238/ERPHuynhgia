import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const LINK_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

const schema = z.object({
  kind: z.enum(["supplier", "subcontractor"]),
  id: z.string().uuid("ID không hợp lệ"),
});

// POST /api/partner-link — sinh (hoặc lấy lại) token link công khai CHỐT CÔNG NỢ
// cho 1 đối tác: NCC hoặc thầu phụ. Trang /doi-tac/[token] chỉ đọc, gom mọi dự án.
// Token random 48 hex, không đoán được, không gắn user (giống /pay/[token]).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!LINK_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền tạo link" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { kind, id } = parsed.data;

  const existing =
    kind === "supplier"
      ? await prisma.supplier.findUnique({ where: { id }, select: { id: true, publicToken: true } })
      : await prisma.subcontractor.findUnique({ where: { id }, select: { id: true, publicToken: true } });
  if (!existing) return NextResponse.json({ message: "Không tìm thấy đối tác" }, { status: 404 });

  let token = existing.publicToken;
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    if (kind === "supplier") {
      await prisma.supplier.update({ where: { id }, data: { publicToken: token } });
    } else {
      await prisma.subcontractor.update({ where: { id }, data: { publicToken: token } });
    }
  }

  return NextResponse.json({ token, path: `/doi-tac/${token}` });
}
