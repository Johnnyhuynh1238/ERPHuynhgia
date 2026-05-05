import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getActiveKpiSettings } from "@/lib/kpi";

function currentMonthString() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isValidMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return /^\d{4}-\d{2}$/.test(value) && Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const internalSecret = request.headers.get("x-internal-job-secret");
  const isSystem = Boolean(process.env.INTERNAL_JOB_SECRET && internalSecret === process.env.INTERNAL_JOB_SECRET);

  if (!isSystem && (!user?.id || user.role !== UserRole.admin)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || currentMonthString();
  if (!isValidMonth(month)) {
    return NextResponse.json({ message: "month không hợp lệ, định dạng đúng: YYYY-MM" }, { status: 400 });
  }

  const setting = await getActiveKpiSettings(month);
  return NextResponse.json({ month, setting });
}
