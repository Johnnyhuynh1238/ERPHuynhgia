import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildCompanyFinance } from "@/lib/company-finance";

export const dynamic = "force-dynamic";

// Lãi/lỗ + vị thế nợ/dư + dự báo 30 ngày + đề xuất cho màn Tài chính tổng quan.
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json(await buildCompanyFinance());
}
