import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";
import { canMarkPayrollPaid } from "@/lib/weekly-payroll";

const bodySchema = z.object({
  paidNote: z.string().trim().max(500).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string; payrollId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canMarkPayrollPaid({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ Kế toán/admin được đánh dấu Đã chi" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { paidNote } = parsed.data;

  const payroll = await prisma.weeklyPayroll.findFirst({
    where: { id: params.payrollId, projectId: project.id },
    select: { id: true, weekKey: true, status: true, totalPayable: true },
  });
  if (!payroll) return NextResponse.json({ message: "Không tìm thấy bảng lương" }, { status: 404 });
  if (payroll.status !== "ready_to_pay") {
    return NextResponse.json({ message: "Bảng lương chưa ở trạng thái Chờ chi" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.weeklyPayroll.update({
      where: { id: payroll.id },
      data: {
        status: "paid",
        paidById: user.id,
        paidAt: new Date(),
        paidNote: paidNote ?? null,
      },
    });
    await logProjectActivity(tx, {
      projectId: project.id,
      actorId: user.id,
      entity: "weekly_payroll",
      entityId: payroll.id,
      action: "mark_paid",
      summary: `Bảng lương ${payroll.weekKey} → Đã chi (${Number(payroll.totalPayable).toLocaleString("vi-VN")}đ)`,
      metadata: { weekKey: payroll.weekKey, status: "paid", paidNote: paidNote ?? null },
    });
  });

  return NextResponse.json({ ok: true });
}
