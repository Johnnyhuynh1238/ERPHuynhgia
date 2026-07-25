import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";

const WRITE_ROLES = ["admin", "construction_manager"] as const;
// Kế toán được sửa RIÊNG thông tin tài khoản thanh toán của thầu phụ (bank),
// không đụng tên/trạng thái/chuyên môn/blacklist.
const PAYMENT_WRITE_ROLES = ["admin", "construction_manager", "accountant"] as const;

export async function requireSubcontractorRead() {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) {
    return {
      user: null,
      error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }),
    };
  }

  return { user, error: null };
}

export async function requireSubcontractorWrite() {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) {
    return {
      user: null,
      error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }),
    };
  }

  if (!WRITE_ROLES.includes(user.role as (typeof WRITE_ROLES)[number])) {
    return {
      user: null,
      error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }),
    };
  }

  return { user, error: null };
}

// Cho phép admin/TPTC (full) + kế toán (chỉ tài khoản thanh toán). Caller tự phân biệt
// qua isFullSubcontractorWrite(user.role) để chặn kế toán sửa ngoài phạm vi bank.
export async function requireSubcontractorPaymentWrite() {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) {
    return {
      user: null,
      error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }),
    };
  }

  if (!PAYMENT_WRITE_ROLES.includes(user.role as (typeof PAYMENT_WRITE_ROLES)[number])) {
    return {
      user: null,
      error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }),
    };
  }

  return { user, error: null };
}

export function isFullSubcontractorWrite(role: string) {
  return WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number]);
}
