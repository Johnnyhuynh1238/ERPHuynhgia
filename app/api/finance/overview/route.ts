import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Tổng quan tài chính toàn công ty (admin).
// Doanh thu = tiền đã thu thực tế từ khách (PaymentSchedule collected/paid + Receipt customer ngoài đợt).
// Chi dự án = sổ quỹ gắn dự án + vật tư NCC đã trả (payment order ghi projectId=null nên phải
// trace qua MaterialProposalItemDebt) + lương thợ tuần đã trả (payroll không ghi sổ quỹ).
// 3 nguồn không giao nhau — không double-count.
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const [
    projects,
    schedulesCollected,
    receiptsOffSchedule,
    cashOutByProject,
    payrollPaid,
    generalExpenseRows,
    subContracts,
    subPaymentsPaid,
    budgets,
    accounts,
    categories,
  ] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ status: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, status: true, contractValue: true },
    }),
    prisma.paymentSchedule.findMany({
      where: { status: { in: ["collected", "paid"] } },
      select: { projectId: true, amount: true, actualPaidAmount: true, paidAmount: true },
    }),
    prisma.receipt.findMany({
      where: { status: "received", source: "customer", paymentScheduleId: null, projectId: { not: null } },
      select: { projectId: true, receivedAmount: true, amount: true },
    }),
    prisma.cashTransaction.groupBy({
      by: ["projectId"],
      where: { direction: "out", projectId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.weeklyPayroll.groupBy({
      by: ["projectId"],
      where: { status: "paid" },
      _sum: { totalPayable: true },
    }),
    // Chi chung cty: sổ quỹ chi không gắn dự án, loại material_proposal (đã phân bổ về dự án qua debts)
    prisma.cashTransaction.groupBy({
      by: ["categoryId"],
      where: { direction: "out", projectId: null, refType: { not: "material_proposal" } },
      _sum: { amount: true },
    }),
    prisma.subContract.findMany({
      where: { status: { in: ["active", "completed"] } },
      select: { projectId: true, contractValue: true },
    }),
    prisma.subPayment.findMany({
      where: { status: "paid", subContract: { status: { in: ["active", "completed"] } } },
      select: { actualAmount: true, expectedAmount: true, subContract: { select: { projectId: true } } },
    }),
    prisma.projectBudget.findMany({
      select: { projectId: true, totalAmount: true, status: true },
    }),
    prisma.cashAccount.findMany({
      where: { active: true },
      select: { currentBalance: true },
    }),
    prisma.expenseCategory.findMany({ select: { id: true, name: true } }),
  ]);

  const add = (m: Map<string, number>, key: string | null | undefined, v: number) => {
    if (!key) return;
    m.set(key, (m.get(key) ?? 0) + v);
  };

  const collectedByProject = new Map<string, number>();
  for (const s of schedulesCollected) {
    add(collectedByProject, s.projectId, Number(s.actualPaidAmount ?? s.paidAmount ?? s.amount));
  }
  for (const r of receiptsOffSchedule) {
    add(collectedByProject, r.projectId, Number(r.receivedAmount ?? r.amount));
  }

  const spentByProject = new Map<string, number>();
  for (const row of cashOutByProject) add(spentByProject, row.projectId, Number(row._sum.amount ?? 0));
  const payrollByProject = new Map<string, number>();
  for (const row of payrollPaid) add(payrollByProject, row.projectId, Number(row._sum.totalPayable ?? 0));

  // Công nợ NCC (flow mới): con_lai theo dự án từ view ncc_cong_no_du_an (nguồn mh_orders).
  const nccDebtRows = await prisma.$queryRaw<{ project_id: string; con_lai: number }[]>`
    SELECT project_id, con_lai::float8 AS con_lai
    FROM ncc_cong_no_du_an
    WHERE con_lai > 0`;
  const supplierDebtByProject = new Map<string, number>();
  let supplierDebtTotal = 0;
  for (const r of nccDebtRows) {
    const v = Number(r.con_lai);
    supplierDebtTotal += v;
    add(supplierDebtByProject, r.project_id, v);
  }

  const subDebtByProject = new Map<string, number>();
  for (const c of subContracts) add(subDebtByProject, c.projectId, Number(c.contractValue));
  for (const p of subPaymentsPaid) {
    add(subDebtByProject, p.subContract.projectId, -Number(p.actualAmount ?? p.expectedAmount));
  }

  const budgetByProject = new Map<string, number>();
  for (const b of budgets) budgetByProject.set(b.projectId, Number(b.totalAmount));

  const projectRows = projects.map((p) => {
    const contractValue = Number(p.contractValue ?? 0);
    const collected = collectedByProject.get(p.id) ?? 0;
    const spent =
      (spentByProject.get(p.id) ?? 0) +
      (payrollByProject.get(p.id) ?? 0);
    const subDebt = Math.max(0, subDebtByProject.get(p.id) ?? 0);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      contractValue,
      collected,
      customerDebt: contractValue - collected,
      spent,
      budget: budgetByProject.get(p.id) ?? null,
      supplierDebt: supplierDebtByProject.get(p.id) ?? 0,
      subcontractorDebt: subDebt,
      grossProfit: collected - spent,
    };
  });

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const generalExpenses = generalExpenseRows
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryId ? (catName.get(row.categoryId) ?? "Khác") : "Không danh mục",
      amount: Number(row._sum.amount ?? 0),
    }))
    .sort((a, b) => b.amount - a.amount);
  const generalTotal = generalExpenses.reduce((s, r) => s + r.amount, 0);

  const totalCollected = projectRows.reduce((s, r) => s + r.collected, 0);
  const totalSpentProjects = projectRows.reduce((s, r) => s + r.spent, 0);
  const totalContractValue = projectRows.reduce((s, r) => s + r.contractValue, 0);
  const totalCustomerDebt = projectRows.reduce((s, r) => s + r.customerDebt, 0);
  const totalSubDebt = projectRows.reduce((s, r) => s + r.subcontractorDebt, 0);
  const cashBalance = accounts.reduce((s, a) => s + Number(a.currentBalance), 0);

  return NextResponse.json({
    summary: {
      totalContractValue,
      totalCollected,
      totalSpent: totalSpentProjects + generalTotal,
      totalSpentProjects,
      generalTotal,
      grossProfit: totalCollected - totalSpentProjects - generalTotal,
      cashBalance,
      customerDebt: totalCustomerDebt,
      supplierDebt: supplierDebtTotal,
      subcontractorDebt: totalSubDebt,
    },
    projects: projectRows,
    generalExpenses,
  });
}
