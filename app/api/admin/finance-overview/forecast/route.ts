import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildCompanyForecast } from "@/lib/company-forecast";

export const dynamic = "force-dynamic";

// Dự báo đến khi xong các HĐ đang chạy (ngân sách từng HĐ + chi phí chung/tháng).
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json(await buildCompanyForecast());
}
