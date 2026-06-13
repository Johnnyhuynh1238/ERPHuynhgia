import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";
import { canMarkPayrollReady } from "@/lib/weekly-payroll";

export async function POST(
  _request: Request,
  { params }: { params: { id: string; payrollId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canMarkPayrollReady({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được chuyển sang Chờ chi" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const payroll = await prisma.weeklyPayroll.findFirst({
    where: { id: params.payrollId, projectId: project.id },
    select: { id: true, weekKey: true, status: true, totalPayable: true },
  });
  if (!payroll) return NextResponse.json({ message: "Không tìm thấy bảng lương" }, { status: 404 });
  if (payroll.status !== "draft") {
    return NextResponse.json({ message: `Trạng thái hiện tại không cho phép chuyển: ${payroll.status}` }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.weeklyPayroll.update({
      where: { id: payroll.id },
      data: {
        status: "ready_to_pay",
        readiedById: user.id,
        readiedAt: new Date(),
      },
    });
    await logProjectActivity(tx, {
      projectId: project.id,
      actorId: user.id,
      entity: "weekly_payroll",
      entityId: payroll.id,
      action: "update_status",
      summary: `Bảng lương ${payroll.weekKey} → Chờ chi (${Number(payroll.totalPayable).toLocaleString("vi-VN")}đ)`,
      metadata: { weekKey: payroll.weekKey, status: "ready_to_pay" },
    });
  });

  return NextResponse.json({ ok: true });
}
