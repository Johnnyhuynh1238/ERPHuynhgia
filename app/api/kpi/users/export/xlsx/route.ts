import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth-helpers";
import { parseMonthInput } from "@/lib/date";
import { calculateKpiForProjectEngineer } from "@/lib/kpi";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { parseKpiRoleFilter } from "@/lib/reporting";
import { prisma } from "@/lib/prisma";

type AppRole = "admin" | "engineer" | "foreman" | "accountant" | "construction_manager";

function canViewKpiUsers(role: string) {
  return role === "admin" || role === "accountant" || role === "construction_manager";
}

function roleLabel(role: AppRole) {
  if (role === "engineer") return "Engineer";
  if (role === "construction_manager") return "TPTC";
  if (role === "admin") return "Admin";
  if (role === "accountant") return "Kế toán";
  return "Foreman";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!canViewKpiUsers(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const monthInput = searchParams.get("month");
  const projectId = searchParams.get("projectId");
  const roleFilter = searchParams.get("role");

  const parsedMonth = parseMonthInput(monthInput, { rejectInvalid: true });
  if (!parsedMonth) {
    return NextResponse.json({ message: "month không hợp lệ, định dạng đúng: YYYY-MM" }, { status: 400 });
  }

  const { month, start, end } = parsedMonth;

  const allowedRoleFilter = parseKpiRoleFilter(roleFilter);
  if (roleFilter && !allowedRoleFilter) {
    return NextResponse.json({ message: "role không hợp lệ, chỉ hỗ trợ engineer|construction_manager" }, { status: 400 });
  }

  const projects = await prisma.project.findMany({
    where: {
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
      ...(projectId ? { id: projectId } : {}),
      goLiveDate: { not: null },
    },
    select: {
      id: true,
      code: true,
      name: true,
      mainEngineerId: true,
      projectManagerId: true,
    },
    orderBy: { code: "asc" },
  });

  const targetUserIds = new Set<string>();
  for (const project of projects) {
    if (!allowedRoleFilter || allowedRoleFilter === "engineer") {
      targetUserIds.add(project.mainEngineerId);
    }
    if (!allowedRoleFilter || allowedRoleFilter === "construction_manager") {
      targetUserIds.add(project.projectManagerId);
    }
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: Array.from(targetUserIds) },
      isActive: true,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
    },
  });

  const userMap = new Map(users.map((row) => [row.id, row]));
  const canSeeDetail = user.role !== "accountant";

  const rows: Array<{
    fullName: string;
    email: string;
    role: AppRole;
    projectCode: string;
    projectName: string;
    score: number;
    rank: string;
    breakdown?: {
      morningOnTime: number;
      eveningOnTime: number;
      taskOnSchedule: number;
      dailyPlanMet: number;
      inspectionQuality: number;
      reportProactivity: number;
    };
  }> = [];

  for (const project of projects) {
    const candidateReporters: string[] = [];
    if (!allowedRoleFilter || allowedRoleFilter === "engineer") {
      candidateReporters.push(project.mainEngineerId);
    }
    if (!allowedRoleFilter || allowedRoleFilter === "construction_manager") {
      candidateReporters.push(project.projectManagerId);
    }

    for (const reporterId of candidateReporters) {
      const info = userMap.get(reporterId);
      if (!info) continue;

      const kpi = await calculateKpiForProjectEngineer({
        projectId: project.id,
        reporterId,
        from: start,
        to: end,
      });

      rows.push({
        fullName: info.fullName,
        email: info.email,
        role: info.role,
        projectCode: project.code,
        projectName: project.name,
        score: kpi.score,
        rank: kpi.rank,
        ...(canSeeDetail ? { breakdown: kpi.breakdown } : {}),
      });
    }
  }

  rows.sort((a, b) => b.score - a.score);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("KPI");

  if (canSeeDetail) {
    sheet.columns = [
      { header: "Họ tên", key: "fullName", width: 24 },
      { header: "Email", key: "email", width: 28 },
      { header: "Role", key: "role", width: 14 },
      { header: "Dự án", key: "projectName", width: 26 },
      { header: "Mã dự án", key: "projectCode", width: 14 },
      { header: `Điểm KPI (${month})`, key: "score", width: 16 },
      { header: "Xếp hạng", key: "rank", width: 12 },
      { header: "Sáng đúng giờ", key: "morningOnTime", width: 16 },
      { header: "Chiều đúng giờ", key: "eveningOnTime", width: 16 },
      { header: "Task đúng tiến độ", key: "taskOnSchedule", width: 18 },
      { header: "Đạt KH ngày", key: "dailyPlanMet", width: 14 },
      { header: "CL nghiệm thu", key: "inspectionQuality", width: 14 },
      { header: "Chủ động BC", key: "reportProactivity", width: 14 },
    ];

    rows.forEach((row) => {
      sheet.addRow({
        fullName: row.fullName,
        email: row.email,
        role: roleLabel(row.role),
        projectName: row.projectName,
        projectCode: row.projectCode,
        score: row.score.toFixed(2),
        rank: row.rank,
        morningOnTime: row.breakdown?.morningOnTime.toFixed(2) ?? "-",
        eveningOnTime: row.breakdown?.eveningOnTime.toFixed(2) ?? "-",
        taskOnSchedule: row.breakdown?.taskOnSchedule.toFixed(2) ?? "-",
        dailyPlanMet: row.breakdown?.dailyPlanMet.toFixed(2) ?? "-",
        inspectionQuality: row.breakdown?.inspectionQuality.toFixed(2) ?? "-",
        reportProactivity: row.breakdown?.reportProactivity.toFixed(2) ?? "-",
      });
    });
  } else {
    sheet.columns = [
      { header: "Họ tên", key: "fullName", width: 24 },
      { header: "Email", key: "email", width: 28 },
      { header: "Role", key: "role", width: 14 },
      { header: "Dự án", key: "projectName", width: 26 },
      { header: "Mã dự án", key: "projectCode", width: 14 },
      { header: `Điểm KPI (${month})`, key: "score", width: 16 },
      { header: "Xếp hạng", key: "rank", width: 12 },
    ];

    rows.forEach((row) => {
      sheet.addRow({
        fullName: row.fullName,
        email: row.email,
        role: roleLabel(row.role),
        projectName: row.projectName,
        projectCode: row.projectCode,
        score: row.score.toFixed(2),
        rank: row.rank,
      });
    });
  }

  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="KPI.xlsx"',
    },
  });
}
