import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildCashPlan, type CashPlanData } from "@/lib/cash-plan";
import { buildBudgetPlan } from "@/lib/budget-plan";
import { syncPaymentLateStatus } from "@/lib/payment-schedule-status";

// Dùng chung cho màn /cash-plan (session) và /api/cron/cash-plan (khoá cron — bản tin dòng tiền
// Văn phòng AI gửi sếp mỗi sáng, 05/11/2026). Giữ 1 chỗ để 2 phía luôn ra cùng số.

export type BudgetRemaining = {
  total: number;
  byProject: { projectId: string; label: string; remaining: number; plannedDate: string | null }[];
};

export type CashPlanPayload = CashPlanData & { budget: BudgetRemaining | null };

/** Toàn bộ dữ liệu kế hoạch thu/chi + "còn phải chi" theo ngân sách (tại ngày bàn giao dự kiến). */
export async function cashPlanPayload(projectId: string | null): Promise<CashPlanPayload> {
  const data = await buildCashPlan({ projectId });

  // "Còn phải chi" theo ngân sách — TỔNG mọi dự án (màn tổng quan cả cty), hoặc
  // riêng 1 dự án nếu đang lọc. Chỉ gồm dự án đã lập ngân sách.
  const plans = await prisma.projectBudgetPlan.findMany({ select: { projectId: true } });
  const targetIds = (projectId ? plans.filter((p) => p.projectId === projectId) : plans).map(
    (p) => p.projectId,
  );
  // Nhãn + ngày bàn giao dự kiến (expectedEndDate) làm ngày kế hoạch mặc định cho khoản ngân sách.
  const projInfo = targetIds.length
    ? new Map(
        (
          await prisma.project.findMany({
            where: { id: { in: targetIds } },
            select: { id: true, code: true, name: true, expectedEndDate: true },
          })
        ).map((p) => [
          p.id,
          { label: `${p.code} · ${p.name}`, plannedDate: p.expectedEndDate.toISOString().slice(0, 10) },
        ]),
      )
    : new Map<string, { label: string; plannedDate: string }>();
  const byProject: BudgetRemaining["byProject"] = [];
  for (const id of targetIds) {
    const bp = await buildBudgetPlan(id);
    if (!bp.exists) continue;
    const info = projInfo.get(id);
    byProject.push({
      projectId: id,
      label: info?.label ?? id,
      remaining: bp.totals.remaining,
      plannedDate: info?.plannedDate ?? null,
    });
  }
  byProject.sort((a, b) => b.remaining - a.remaining);
  const budget = byProject.length
    ? { total: byProject.reduce((s, r) => s + r.remaining, 0), byProject }
    : null;

  return { ...data, budget };
}

export type NativeSourceType = "sub_payment" | "payment_schedule" | "mh_order";

/** Đổi ngày gốc ở NGUỒN (đồng bộ 2 chiều). date null = xoá ngày gốc. Trả lỗi dạng chữ nếu không hợp lệ. */
export async function setNativeDate(
  sourceType: NativeSourceType,
  sourceId: string,
  date: string | null,
  /** Ngày trên lịch = ngày gốc + offset (đơn công nợ: ngày trả = ngày giao + số ngày nợ) → ghi ngược trừ offset. */
  offsetDays = 0,
): Promise<string | null> {
  const value = date ? new Date(new Date(`${date}T00:00:00Z`).getTime() - offsetDays * 86_400_000) : null;
  if (sourceType === "sub_payment" || sourceType === "payment_schedule") {
    const linked =
      sourceType === "sub_payment"
        ? await prisma.subPayment.findUnique({ where: { id: sourceId }, select: { workIds: true } })
        : await prisma.paymentSchedule.findUnique({ where: { id: sourceId }, select: { workIds: true } });
    if (linked?.workIds.length) return "Ngày theo tiến độ — đổi ở Tiến độ";
  }
  if (sourceType === "sub_payment") {
    if (!value) return "Đợt thầu phụ bắt buộc có ngày";
    await prisma.subPayment.update({ where: { id: sourceId }, data: { expectedDate: value } });
  } else if (sourceType === "payment_schedule") {
    const row = await prisma.paymentSchedule.update({
      where: { id: sourceId },
      data: { expectedDate: value, dueDate: value },
    });
    await syncPaymentLateStatus(row.projectId);
  } else {
    await prisma.mhOrder.update({ where: { id: sourceId }, data: { deliveryDate: value } });
  }
  return null;
}

/** Đổi ngày 1 đợt kế hoạch (cash_plan_items). null = về "chưa kế hoạch". */
export async function setItemDate(id: string, date: string | null) {
  const data: Prisma.CashPlanItemUpdateInput = {
    plannedDate: date ? new Date(`${date}T00:00:00Z`) : null,
  };
  await prisma.cashPlanItem.update({ where: { id }, data });
}

/** Đổi ngày 1 dòng kế hoạch dòng tiền dự án (project_cash_lines) — đánh dấu sửa tay, tạo lại từ dự toán vẫn giữ. */
export async function setLineDate(id: string, date: string) {
  await prisma.projectCashLine.update({
    where: { id },
    data: { dueDate: new Date(`${date}T00:00:00Z`), dateManual: true },
  });
}
