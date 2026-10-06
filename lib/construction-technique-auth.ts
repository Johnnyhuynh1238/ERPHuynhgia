import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "./auth-helpers";

// Kỹ thuật thi công: admin + TPTC sửa mẫu; KS xem (để đọc khi giám sát).
export const CT_READ: UserRole[] = [UserRole.admin, UserRole.construction_manager, UserRole.engineer];
export const CT_WRITE: UserRole[] = [UserRole.admin, UserRole.construction_manager];

export async function requireCt(write: boolean) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return { user: null, error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }) };
  if (!(write ? CT_WRITE : CT_READ).includes(user.role as UserRole))
    return { user: null, error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }) };
  return { user, error: null };
}
