import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";
import { canCloseWeek } from "@/lib/weekly-payroll";

const createSchema = z.object({
  workerId: z.string().uuid("workerId không hợp lệ"),
  amount: z.coerce.number().int().refine((n) => n !== 0, "amount phải khác 0"),
  reason: z.string().trim().min(2, "Nhập lý do").max(300),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const list = await prisma.weeklyPayrollAdjustment.findMany({
    where: { projectId: project.id, appliedPayrollId: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, workerId: true, amount: true, reason: true, createdAt: true,
      worker: { select: { fullName: true } },
      createdBy: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json({
    pendingAdjustments: list.map((a) => ({
      id: a.id,
      workerId: a.workerId,
      workerName: a.worker.fullName,
      amount: Number(a.amount),
      reason: a.reason,
      createdAt: a.createdAt,
      createdBy: a.createdBy,
    })),
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canCloseWeek({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được tạo điều chỉnh" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { workerId, amount, reason } = parsed.data;

  const worker = await prisma.worker.findFirst({
    where: { id: workerId, projectId: project.id },
    select: { id: true, fullName: true },
  });
  if (!worker) return NextResponse.json({ message: "Thợ không thuộc dự án này" }, { status: 400 });

  const created = await prisma.$transaction(async (tx) => {
    const adj = await tx.weeklyPayrollAdjustment.create({
      data: {
        projectId: project.id,
        workerId,
        amount: BigInt(amount),
        reason,
        createdById: user.id,
      },
      select: { id: true },
    });
    await logProjectActivity(tx, {
      projectId: project.id,
      actorId: user.id,
      entity: "weekly_payroll_adjustment",
      entityId: adj.id,
      action: "create",
      summary: `Điều chỉnh lương ${worker.fullName}: ${amount > 0 ? "+" : ""}${amount.toLocaleString("vi-VN")}đ — ${reason}`,
      metadata: { workerId, amount, reason },
    });
    return adj;
  });

  return NextResponse.json({ ok: true, id: created.id });
}
