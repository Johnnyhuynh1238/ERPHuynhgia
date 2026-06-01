import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth-helpers";
import {
  canViewAdminAttendance,
  getKsAttendanceForMonth,
  parseMonth,
} from "@/lib/attendance-summary";

function formatVnClock(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesToHM(mins: number) {
  if (!mins || mins <= 0) return "0";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

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
  const monthLabel = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;

  const summary = await getKsAttendanceForMonth({
    year: parsed.year,
    month: parsed.month,
    userId,
  });

  const workbook = new ExcelJS.Workbook();

  const roleLabelOf = (role: string) =>
    role === "engineer" ? "KS" : role === "accountant" ? "Kế toán" : role;

  // Sheet 1: Tổng hợp
  const overview = workbook.addWorksheet("Tổng hợp");
  overview.columns = [
    { header: "Vai trò", key: "role", width: 10 },
    { header: "Họ tên", key: "fullName", width: 24 },
    { header: "Email", key: "email", width: 28 },
    { header: "Số ngày có chấm", key: "daysWorked", width: 18 },
    { header: "Tổng giờ", key: "totalHM", width: 14 },
    { header: "Tổng phút", key: "totalMinutes", width: 14 },
    { header: "Số ngày chưa chấm ra", key: "openDays", width: 22 },
  ];
  summary.forEach((row) => {
    overview.addRow({
      role: roleLabelOf(row.role),
      fullName: row.fullName,
      email: row.email,
      daysWorked: row.daysWorked,
      totalHM: minutesToHM(row.totalMinutes),
      totalMinutes: row.totalMinutes,
      openDays: row.openDays,
    });
  });
  overview.getRow(1).font = { bold: true };

  // Sheet 2: Chi tiết theo ngày
  const detail = workbook.addWorksheet("Chi tiết ngày");
  detail.columns = [
    { header: "Vai trò", key: "role", width: 10 },
    { header: "Họ tên", key: "fullName", width: 24 },
    { header: "Ngày", key: "date", width: 14 },
    { header: "Số phiên", key: "sessions", width: 10 },
    { header: "Tổng giờ", key: "totalHM", width: 12 },
    { header: "Tổng phút", key: "totalMinutes", width: 12 },
    { header: "Vào sớm nhất", key: "firstIn", width: 16 },
    { header: "Ra muộn nhất", key: "lastOut", width: 16 },
    { header: "Còn phiên hở", key: "hasOpen", width: 14 },
  ];
  summary.forEach((row) => {
    row.days.forEach((day) => {
      detail.addRow({
        role: roleLabelOf(row.role),
        fullName: row.fullName,
        date: day.date,
        sessions: day.sessions,
        totalHM: minutesToHM(day.totalMinutes),
        totalMinutes: day.totalMinutes,
        firstIn: formatVnClock(day.firstIn),
        lastOut: formatVnClock(day.lastOut),
        hasOpen: day.hasOpen ? "Có" : "",
      });
    });
  });
  detail.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cham-cong-${monthLabel}.xlsx"`,
    },
  });
}
