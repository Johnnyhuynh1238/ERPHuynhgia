import { NextResponse } from "next/server";
import { z } from "zod";
import { BudgetPlanStatus, CashTerm, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { requireAdmin } from "@/lib/estimate";
import { buildProjectCashFlow, generateProjectCashLines } from "@/lib/cash-forecast";

export const runtime = "nodejs";

/**
 * Kế hoạch dòng tiền dự án (GĐ 5 Chuẩn bị, 05/11/2026).
 *   GET  admin + kế toán → buildProjectCashFlow (dòng dự báo + nguồn thật + lịch tháng/tuần)
 *   POST admin:
 *     {op:"regen"}                                        sinh lại từ dự toán + tiến độ (giữ ngày sửa tay)
 *     {op:"header", contingencyPct?, receiptDelayDays?, leadDays?, status?, note?}
 *     {op:"line", id, dueDate?, amount?, term?, note?}      sửa 1 dòng dự báo
 *     {op:"supplier_term", supplierId, paymentTerm, creditDays?}  đổi điều khoản NCC (áp mọi dự án) rồi sinh lại
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant)
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  try {
    return NextResponse.json(await buildProjectCashFlow(params.id));
  } catch (err) {
    console.error("[dong-tien GET]", err);
    return NextResponse.json({ message: err instanceof Error ? err.message : "lỗi" }, { status: 500 });
  }
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");
const termEnum = z.enum(["no_ngay", "tra_ngay", "sau_nghiem_thu"]);
const bodySchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("regen") }),
  z.object({
    op: z.literal("header"),
    contingencyPct: z.coerce.number().min(0).max(50).optional(),
    receiptDelayDays: z.coerce.number().int().min(0).max(90).optional(),
    leadDays: z.coerce.number().int().min(0).max(60).optional(),
    status: z.enum(["draft", "locked"]).optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  }),
  z.object({
    op: z.literal("line"),
    id: z.string().uuid(),
    dueDate: dateStr.optional(),
    amount: z.coerce.number().min(0).optional(),
    term: termEnum.optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  }),
  z.object({
    op: z.literal("supplier_term"),
    supplierId: z.string().uuid(),
    paymentTerm: termEnum,
    creditDays: z.coerce.number().int().min(0).max(180).optional(),
  }),
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const b = parsed.data;
  const projectId = params.id;
  try {
    if (b.op === "regen") {
      const plan = await prisma.projectCashPlan.findUnique({ where: { projectId }, select: { status: true } });
      if (plan?.status === BudgetPlanStatus.locked)
        return NextResponse.json({ message: "Kế hoạch đã khoá — mở khoá trước khi tạo lại" }, { status: 400 });
      const r = await generateProjectCashLines(projectId);
      return NextResponse.json({ ok: true, ...r });
    }
    if (b.op === "header") {
      const data: Prisma.ProjectCashPlanUncheckedUpdateInput = {};
      if (b.contingencyPct !== undefined) data.contingencyPct = new Prisma.Decimal(b.contingencyPct);
      if (b.receiptDelayDays !== undefined) data.receiptDelayDays = b.receiptDelayDays;
      if (b.leadDays !== undefined) data.leadDays = b.leadDays;
      if (b.note !== undefined) data.note = b.note;
      if (b.status !== undefined) {
        if (b.status === "locked") {
          const cnt = await prisma.projectCashLine.count({ where: { projectId } });
          if (!cnt) return NextResponse.json({ message: "Chưa có dòng nào — tạo từ dự toán trước" }, { status: 400 });
        }
        data.status = b.status as BudgetPlanStatus;
        data.lockedAt = b.status === "locked" ? new Date() : null;
      }
      await prisma.projectCashPlan.upsert({
        where: { projectId },
        create: { ...(data as Omit<Prisma.ProjectCashPlanUncheckedCreateInput, "projectId">), projectId },
        update: data,
      });
      return NextResponse.json({ ok: true });
    }
    if (b.op === "line") {
      const line = await prisma.projectCashLine.findUnique({ where: { id: b.id }, select: { projectId: true } });
      if (!line || line.projectId !== projectId) return NextResponse.json({ message: "Không thấy dòng" }, { status: 404 });
      const data: Prisma.ProjectCashLineUncheckedUpdateInput = {};
      if (b.dueDate !== undefined) {
        data.dueDate = new Date(`${b.dueDate}T00:00:00Z`);
        data.dateManual = true;
      }
      if (b.amount !== undefined) data.amount = new Prisma.Decimal(Math.round(b.amount));
      if (b.term !== undefined) data.term = b.term as CashTerm;
      if (b.note !== undefined) data.note = b.note;
      await prisma.projectCashLine.update({ where: { id: b.id }, data });
      return NextResponse.json({ ok: true });
    }
    // supplier_term: đổi điều khoản ở danh bạ NCC (dùng chung mọi dự án) rồi sinh lại nếu chưa khoá.
    await prisma.supplier.update({
      where: { id: b.supplierId },
      data: { paymentTerm: b.paymentTerm as CashTerm, ...(b.creditDays !== undefined ? { creditDays: b.creditDays } : {}) },
    });
    const plan = await prisma.projectCashPlan.findUnique({ where: { projectId }, select: { status: true } });
    if (plan && plan.status !== BudgetPlanStatus.locked) await generateProjectCashLines(projectId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[dong-tien POST]", err);
    return NextResponse.json({ message: err instanceof Error ? err.message : "lỗi" }, { status: 500 });
  }
}
