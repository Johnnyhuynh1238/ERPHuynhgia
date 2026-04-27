import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

function mapAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "401_UNAUTHORIZED") {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (message === "403_FORBIDDEN") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  return null;
}

function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true },
  });

  if (!targetUser) {
    return NextResponse.json({ message: "Không tìm thấy user" }, { status: 404 });
  }

  const tempPassword = generatePassword(12);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await prisma.user.update({
    where: { id: targetUser.id },
    data: {
      passwordHash,
      mustChangePassword: true,
    },
  });

  return NextResponse.json({
    message: `Đã reset password cho ${targetUser.email}`,
    tempPassword,
  });
}
