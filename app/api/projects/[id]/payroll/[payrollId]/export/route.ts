import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";
import { buildBankCsv, canExportBankCsv } from "@/lib/weekly-payroll";

export async function GET(
  _request: Request,
  { params }: { params: { id: string; payrollId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canExportBankCsv({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ Kế toán/admin được xuất CSV chuyển khoản" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const payroll = await prisma.weeklyPayroll.findFirst({
    where: { id: params.payrollId, projectId: project.id },
    select: {
      id: true, weekKey: true, status: true,
      lines: {
        orderBy: { fullName: "asc" },
        select: { fullName: true, bankAccount: true, bankName: true, payable: true },
      },
    },
  });
  if (!payroll) return NextResponse.json({ message: "Không tìm thấy bảng lương" }, { status: 404 });

  const rows = payroll.lines
    .filter((l) => Number(l.payable) > 0)
    .map((l) => ({
      fullName: l.fullName,
      bankAccount: l.bankAccount,
      bankName: l.bankName,
      payable: Number(l.payable),
    }));

  const csv = buildBankCsv(rows, payroll.weekKey, project.code);

  await logProjectActivity(prisma, {
    projectId: project.id,
    actorId: user.id,
    entity: "weekly_payroll",
    entityId: payroll.id,
    action: "upload",
    summary: `Xuất CSV chuyển khoản tuần ${payroll.weekKey} (${rows.length} dòng)`,
    metadata: { weekKey: payroll.weekKey, rowCount: rows.length },
  });

  const filename = `luong_${project.code}_${payroll.weekKey}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
