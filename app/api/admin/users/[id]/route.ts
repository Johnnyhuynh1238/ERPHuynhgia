import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

const updateSchema = z.object({
  fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự"),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  role: z.nativeEnum(UserRole),
  isActive: z.boolean(),
});

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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let adminUser;
  try {
    adminUser = await requireRole([UserRole.admin]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const targetId = params.id;

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      role: true,
      isActive: true,
      email: true,
    },
  });

  if (!targetUser) {
    return NextResponse.json({ message: "Không tìm thấy user" }, { status: 404 });
  }

  const isSelf = adminUser.id === targetUser.id;

  if (isSelf && !parsed.data.isActive) {
    return NextResponse.json({ message: "Không thể vô hiệu hóa chính mình" }, { status: 400 });
  }

  if (isSelf && parsed.data.role !== UserRole.admin) {
    return NextResponse.json({ message: "Không thể tự đổi role khỏi admin" }, { status: 400 });
  }

  const isAdminRemovingAdminRole = targetUser.role === UserRole.admin && parsed.data.role !== UserRole.admin;
  const isAdminTurningInactive = targetUser.role === UserRole.admin && !parsed.data.isActive;

  if (isAdminRemovingAdminRole || isAdminTurningInactive) {
    const activeAdminCount = await prisma.user.count({
      where: {
        role: UserRole.admin,
        isActive: true,
      },
    });

    const targetIsActiveAdmin = targetUser.role === UserRole.admin && targetUser.isActive;
    if (targetIsActiveAdmin && activeAdminCount <= 1) {
      return NextResponse.json({ message: "Hệ thống phải còn ít nhất 1 admin hoạt động" }, { status: 400 });
    }
  }

  const user = await prisma.user.update({
    where: { id: targetId },
    data: {
      fullName: parsed.data.fullName,
      phone: parsed.data.phone || null,
      role: parsed.data.role,
      isActive: parsed.data.isActive,
    },
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

  return NextResponse.json({ user });
}
