import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  canViewAdminWorkerAttendance,
  getAccessibleProjectIdsForWorkerAttendance,
  getWorkerAttendanceForWeek,
  mondayOfWeekUtc,
  parseDateOnly,
} from "@/lib/worker-attendance-summary";

const DOW_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function formatDM(ymd: string) {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !canViewAdminWorkerAttendance(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ message: "Thiếu projectId" }, { status: 400 });
  }

  const accessibleIds = await getAccessibleProjectIdsForWorkerAttendance(user.id, user.role);
  if (accessibleIds !== null && !accessibleIds.includes(projectId)) {
    return NextResponse.json({ message: "Không có quyền với dự án này" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) {
    return NextResponse.json({ message: "Dự án không tồn tại" }, { status: 404 });
  }

  const dateParam = parseDateOnly(url.searchParams.get("date"));
  const monday = mondayOfWeekUtc(dateParam ?? new Date());
  const data = await getWorkerAttendanceForWeek({ projectId, monday });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Bảng công");

  ws.mergeCells(1, 1, 1, 12);
  ws.getCell(1, 1).value = `BẢNG LƯƠNG THỢ — ${project.name}`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(1, 1).alignment = { horizontal: "center" };

  ws.mergeCells(2, 1, 2, 12);
  ws.getCell(2, 1).value = `Tuần: ${formatDM(data.weekStart)} – ${formatDM(data.weekEnd)}`;
  ws.getCell(2, 1).alignment = { horizontal: "center" };

  const header = ["STT", "Họ tên", "Loại", "SĐT"];
  for (let i = 0; i < 7; i++) {
    header.push(`${DOW_LABELS[i]} ${formatDM(data.dates[i])}`);
  }
  header.push("Số công", "Lương ngày (₫)", "Tổng tuần (₫)");

  const headerRow = ws.addRow([]);
  ws.addRow([]);
  const realHeader = ws.addRow(header);
  realHeader.font = { bold: true };
  realHeader.alignment = { horizontal: "center", vertical: "middle" };
  realHeader.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    c.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
  headerRow.hidden = true;

  data.rows.forEach((r, idx) => {
    const dayCells = data.dates.map((d) => {
      const cell = r.days[d];
      if (cell?.morning && cell?.afternoon) return "S+C";
      if (cell?.morning) return "S";
      if (cell?.afternoon) return "C";
      return "";
    });
    const row = ws.addRow([
      idx + 1,
      r.fullName,
      r.role === "tho" ? "Thợ" : "Phụ",
      r.phone || "",
      ...dayCells,
      r.workDays,
      r.dailyRate ?? "",
      r.totalWage ?? "",
    ]);
    row.eachCell((c) => {
      c.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
    const rateCell = row.getCell(13);
    const totalCell = row.getCell(14);
    if (typeof rateCell.value === "number") rateCell.numFmt = "#,##0";
    if (typeof totalCell.value === "number") totalCell.numFmt = "#,##0";
    row.getCell(12).alignment = { horizontal: "right" };
    rateCell.alignment = { horizontal: "right" };
    totalCell.alignment = { horizontal: "right" };
  });

  const totalRow = ws.addRow([
    "",
    `Tổng ${data.rows.length} thợ`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    data.totals.workDays,
    "",
    data.totals.totalWage,
  ]);
  totalRow.font = { bold: true };
  totalRow.getCell(14).numFmt = "#,##0";
  totalRow.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E5" } };
    c.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
  totalRow.getCell(12).alignment = { horizontal: "right" };
  totalRow.getCell(14).alignment = { horizontal: "right" };

  ws.columns = [
    { width: 5 },
    { width: 24 },
    { width: 7 },
    { width: 13 },
    { width: 9 },
    { width: 9 },
    { width: 9 },
    { width: 9 },
    { width: 9 },
    { width: 9 },
    { width: 9 },
    { width: 9 },
    { width: 16 },
    { width: 18 },
  ];

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `bang-cong-tho_${project.name.replace(/[^A-Za-z0-9]+/g, "-")}_${data.weekStart}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
