import { prisma } from "@/lib/prisma";

// Tóm tắt tài chính 1 dự án cho header đầu màn dự án (admin/kế toán).
// Cùng ngữ nghĩa với app/api/projects/[id]/finance để số khớp trang Tài chính:
//   Thu   = các đợt PaymentSchedule đã thu + receipt customer ngoài đợt.
//   Chi   = sổ quỹ gắn dự án (out) + vật tư NCC đã trả (debts paidAt) + lương thợ đã trả.
//   Nợ NCC = debts chưa trả (material_proposal_item_debts.paidAt = null).
//   "Đến hiện tại" = Thực chi + Nợ NCC (chi phí đã phát sinh, gồm cả phần còn nợ).
export type ProjectFinanceSummary = {
  contractValue: number;
  collected: number;
  remaining: number;
  spent: number;
  supplierDebt: number;
  incurred: number; // spent + supplierDebt
  budgetTotal: number | null; // null = chưa lập dự toán
  remainingToSpend: number | null; // budgetTotal - incurred (null nếu chưa có dự toán)
  collectedPct: number; // 0..100
};

export async function getProjectFinanceSummary(projectId: string): Promise<ProjectFinanceSummary> {
  const [project, schedules, extraReceipts, cashOut, debts, payrolls, budget] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { contractValue: true } }),
    prisma.paymentSchedule.findMany({
      where: { projectId },
      select: { status: true, amount: true, actualPaidAmount: true, paidAmount: true },
    }),
    prisma.receipt.findMany({
      where: { projectId, status: "received", source: "customer", paymentScheduleId: null },
      select: { receivedAmount: true, amount: true },
    }),
    prisma.cashTransaction.findMany({ where: { projectId, direction: "out" }, select: { amount: true } }),
    prisma.materialProposalItemDebt.findMany({
      where: { proposal: { projectId } },
      select: { totalAmount: true, paidAt: true },
    }),
    prisma.weeklyPayroll.findMany({ where: { projectId, status: "paid" }, select: { totalPayable: true } }),
    prisma.projectBudget.findUnique({ where: { projectId }, select: { totalAmount: true } }),
  ]);

  const contractValue = Number(project?.contractValue ?? 0);

  const collectedSchedules = schedules.reduce((s, r) => {
    const done = r.status === "collected" || r.status === "paid";
    return s + (done ? Number(r.actualPaidAmount ?? r.paidAmount ?? r.amount) : 0);
  }, 0);
  const collectedExtra = extraReceipts.reduce((s, r) => s + Number(r.receivedAmount ?? r.amount), 0);
  const collected = collectedSchedules + collectedExtra;

  const cashSpent = cashOut.reduce((s, t) => s + Number(t.amount), 0);
  const materialPaid = debts.filter((d) => d.paidAt).reduce((s, d) => s + Number(d.totalAmount), 0);
  const payrollTotal = payrolls.reduce((s, p) => s + Number(p.totalPayable), 0);
  const spent = cashSpent + materialPaid + payrollTotal;

  const supplierDebt = debts.filter((d) => !d.paidAt).reduce((s, d) => s + Number(d.totalAmount), 0);
  const incurred = spent + supplierDebt;

  const budgetTotal = budget && Number(budget.totalAmount) > 0 ? Number(budget.totalAmount) : null;
  const remainingToSpend = budgetTotal != null ? budgetTotal - incurred : null;

  const collectedPct = contractValue > 0 ? Math.min(100, Math.round((collected / contractValue) * 1000) / 10) : 0;

  return {
    contractValue,
    collected,
    remaining: contractValue - collected,
    spent,
    supplierDebt,
    incurred,
    budgetTotal,
    remainingToSpend,
    collectedPct,
  };
}
