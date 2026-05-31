import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import {
  canViewAdminAttendance,
  getKsAttendanceForMonth,
  parseMonth,
} from "@/lib/attendance-summary";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !canViewAdminAttendance(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = parseMonth(url.searchParams.get("month"));
  if (!parsed) {
    return NextResponse.json({ message: "Tháng không hợp lệ (YYYY-MM)" }, { status: 400 });
  }
  const userId = url.searchParams.get("userId") || null;

  const summary = await getKsAttendanceForMonth({
    year: parsed.year,
    month: parsed.month,
    userId,
  });

  return NextResponse.json({
    month: `${parsed.year}-${String(parsed.month).padStart(2, "0")}`,
    summary,
  });
}
