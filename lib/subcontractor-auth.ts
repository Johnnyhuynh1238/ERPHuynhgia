import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";

const WRITE_ROLES = ["admin", "construction_manager"] as const;

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
