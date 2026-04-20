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

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  let adminUser;
  try {
    adminUser = await requireRole([UserRole.admin]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, isActive: true, email: true },
  });

  if (!targetUser) {
    return NextResponse.json({ message: "Không tìm thấy user" }, { status: 404 });
  }

  if (targetUser.id === adminUser.id) {
    return NextResponse.json({ message: "Không thể vô hiệu hóa chính mình" }, { status: 400 });
  }

  const nextIsActive = !targetUser.isActive;

  if (!nextIsActive && targetUser.role === UserRole.admin) {
    const activeAdminCount = await prisma.user.count({
      where: {
        role: UserRole.admin,
        isActive: true,
      },
    });

    if (activeAdminCount <= 1) {
      return NextResponse.json({ message: "Hệ thống phải còn ít nhất 1 admin hoạt động" }, { status: 400 });
    }
  }

  const user = await prisma.user.update({
    where: { id: targetUser.id },
    data: { isActive: nextIsActive },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    user,
    message: nextIsActive ? "Đã kích hoạt lại" : "Đã vô hiệu hóa",
  });
}
