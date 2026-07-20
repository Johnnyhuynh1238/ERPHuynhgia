import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const LINK_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

// Sinh (hoặc lấy lại) token theo dõi công khai cho NCC. Token random 48 hex, không đoán được.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!LINK_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền tạo link" }, { status: 403 });
  }

  const expense = await prisma.expense.findUnique({
    where: { id: params.id },
    select: { id: true, publicToken: true },
  });
  if (!expense) return NextResponse.json({ message: "Không tìm thấy lệnh chi" }, { status: 404 });

  let token = expense.publicToken;
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    await prisma.expense.update({ where: { id: expense.id }, data: { publicToken: token } });
  }

  return NextResponse.json({ token, path: `/pay/${token}` });
}
