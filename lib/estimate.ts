import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";

export type EstimateDrawing = { key: string; name: string; type: string };
export type EstimateQa = { q: string; a?: string; askedAt: string; answeredAt?: string };

// Dự toán AI là công cụ riêng của admin — mọi API estimate đều chặn role khác.
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return { user: null, error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }) };
  }
  if (user.role !== "admin") {
    return { user: null, error: NextResponse.json({ message: "Chỉ admin" }, { status: 403 }) };
  }
  return { user, error: null };
}

// Mua hàng: admin (tự do) + kế toán (bị chặn giá/SL theo dự toán).
// isKeToan = true → API áp 2 tường: giá lấy từ dự toán, SL không vượt dự toán.
export async function requireMuaHang() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return { user: null, isKeToan: false, error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }) };
  }
  if (user.role !== "admin" && user.role !== "accountant") {
    return { user: null, isKeToan: false, error: NextResponse.json({ message: "Không có quyền mua hàng" }, { status: 403 }) };
  }
  return { user, isKeToan: user.role === "accountant", error: null };
}
