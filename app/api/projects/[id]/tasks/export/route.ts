import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { TaskPhase, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { PHASE_COLOR, PHASE_LABEL, STATUS_LABEL } from "@/lib/task-display";

function fmtDate(value: Date) {
  const d = String(value.getUTCDate()).padStart(2, "0");
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const y = value.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin", "accountant"]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true },
  });

  if (!project) {
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  const tasks = await prisma.task.findMany({
    where: { projectId: params.id, isActive: true },
    include: {
      assignedEngineer: { select: { fullName: true } },
      assignedForeman: { select: { fullName: true } },
    },
    orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tiến độ");

  sheet.columns = [
    { header: "Mã", key: "code", width: 10 },
    { header: "Giai đoạn", key: "phase", width: 18 },
    { header: "Công tác", key: "name", width: 36 },
    { header: "Offset", key: "offsetDays", width: 8 },
    { header: "Số ngày", key: "durationDays", width: 8 },
    { header: "Ngày BĐ", key: "start", width: 12 },
    { header: "Ngày KT", key: "end", width: 12 },
    { header: "Đội", key: "team", width: 16 },
    { header: "KS phụ trách", key: "engineer", width: 18 },
    { header: "Nghiệm thu", key: "inspect", width: 14 },
    { header: "Vật tư chính", key: "materials", width: 26 },
    { header: "Ai đề xuất", key: "proposer", width: 14 },
    { header: "Ai đặt hàng", key: "orderer", width: 14 },
    { header: "Ai nhận & kiểm", key: "receiver", width: 16 },
    { header: "Trạng thái", key: "status", width: 14 },
  ];

  sheet.getRow(1).font = { bold: true };

  tasks.forEach((task) => {
    const row = sheet.addRow({
      code: task.code,
      phase: PHASE_LABEL[task.phase],
      name: task.isMilestone ? `⚠️ ${task.name}` : task.name,
      offsetDays: task.offsetDays,
      durationDays: task.durationDays,
      start: fmtDate(task.plannedStartDate),
      end: fmtDate(task.plannedEndDate),
      team: task.team || task.assignedForeman?.fullName || "-",
      engineer: task.assignedEngineer?.fullName || "Chưa gán",
      inspect: task.inspectorName || "-",
      materials: task.materialsNeeded,
      proposer: task.proposerRole || "-",
      orderer: task.ordererRole || "-",
      receiver: task.receiverRole || "-",
      status: STATUS_LABEL[task.status],
    });

    const phaseCell = row.getCell(2);
    const color = PHASE_COLOR[task.phase as TaskPhase].replace("#", "");
    phaseCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${color}` },
    };

    if (task.isMilestone) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFC7CE" },
        };
      });
      row.getCell(3).font = { bold: true, color: { argb: "FF9C0006" } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date();
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();

  const filename = `TienDo_${project.code}_${dd}${mm}${yyyy}.xlsx`;

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
