import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Tài chính 1 dự án (admin).
// Thu: các đợt PaymentSchedule + receipt customer ngoài đợt.
// Chi: sổ quỹ gắn dự án (lệnh chi + thầu phụ) + vật tư NCC đã trả (qua debts) + lương thợ đã trả.
// Công nợ: NCC = debts chưa trả; thầu phụ = giá trị HĐ giao khoán − đã chi.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, status: true, contractValue: true },
  });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const [
    schedules,
    receiptsOffSchedule,
    cashOut,
    debts,
    payrolls,
    subContracts,
    subPayments,
    budget,
    categories,
  ] = await Promise.all([
    prisma.paymentSchedule.findMany({
      where: { projectId: id },
      orderBy: [{ phaseNumber: "asc" }, { installmentNo: "asc" }],
      select: {
        id: true,
        phaseNumber: true,
        installmentNo: true,
        type: true,
        milestoneDescription: true,
        description: true,
        percent: true,
        amount: true,
        status: true,
        expectedDate: true,
        dueDate: true,
        actualPaidDate: true,
        paidAt: true,
        actualPaidAmount: true,
        paidAmount: true,
      },
    }),
    prisma.receipt.findMany({
      where: { projectId: id, status: "received", source: "customer", paymentScheduleId: null },
      orderBy: { receivedAt: "desc" },
      select: { id: true, code: true, receivedAmount: true, amount: true, receivedAt: true, note: true },
    }),
    prisma.cashTransaction.findMany({
      where: { projectId: id, direction: "out" },
      select: { amount: true, refType: true, categoryId: true },
    }),
    prisma.materialProposalItemDebt.findMany({
      where: { proposal: { projectId: id } },
      select: { totalAmount: true, paidAt: true, supplier: { select: { id: true, name: true } } },
    }),
    prisma.weeklyPayroll.findMany({
      where: { projectId: id, status: "paid" },
      select: { totalPayable: true },
    }),
    prisma.subContract.findMany({
      where: { projectId: id, status: { in: ["active", "completed"] } },
      select: { id: true, code: true, title: true, contractValue: true, subcontractor: { select: { name: true } } },
    }),
    prisma.subPayment.findMany({
      where: { subContract: { projectId: id, status: { in: ["active", "completed"] } }, status: "paid" },
      select: { subContractId: true, actualAmount: true, expectedAmount: true },
    }),
    prisma.projectBudget.findUnique({
      where: { projectId: id },
      select: { status: true, totalLabor: true, totalMaterial: true, totalEquipment: true, totalAmount: true },
    }),
    prisma.expenseCategory.findMany({ select: { id: true, name: true } }),
  ]);

  const contractValue = Number(project.contractValue ?? 0);

  // Thu
  const scheduleRows = schedules.map((s) => {
    const isDone = s.status === "collected" || s.status === "paid";
    return {
      id: s.id,
      label:
        s.type === "addendum"
          ? `Phụ lục đợt ${s.installmentNo ?? s.phaseNumber}${s.description ? ` — ${s.description}` : ""}`
          : `Đợt ${s.phaseNumber} — ${s.milestoneDescription}`,
      percent: s.percent != null ? Number(s.percent) : null,
      amount: Number(s.amount),
      status: s.status,
      collected: isDone ? Number(s.actualPaidAmount ?? s.paidAmount ?? s.amount) : 0,
      date: s.actualPaidDate ?? s.paidAt ?? s.expectedDate ?? s.dueDate,
    };
  });
  const collectedSchedules = scheduleRows.reduce((s, r) => s + r.collected, 0);
  const extraReceipts = receiptsOffSchedule.map((r) => ({
    id: r.id,
    code: r.code,
    amount: Number(r.receivedAmount ?? r.amount),
    receivedAt: r.receivedAt,
    note: r.note,
  }));
  const collectedExtra = extraReceipts.reduce((s, r) => s + r.amount, 0);
  const collected = collectedSchedules + collectedExtra;

  // Chi — 4 nhóm
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  let cashExpense = 0; // lệnh chi + chi khác qua sổ quỹ
  let cashSubPayment = 0; // chi thầu phụ (đã ghi sổ quỹ)
  const byCategory = new Map<string, number>();
  for (const t of cashOut) {
    const v = Number(t.amount);
    if (t.refType === "sub_payment") {
      cashSubPayment += v;
    } else {
      cashExpense += v;
      const key = t.categoryId ? (catName.get(t.categoryId) ?? "Khác") : "Không danh mục";
      byCategory.set(key, (byCategory.get(key) ?? 0) + v);
    }
  }
  const materialPaid = debts.filter((d) => d.paidAt).reduce((s, d) => s + Number(d.totalAmount), 0);
  const payrollTotal = payrolls.reduce((s, p) => s + Number(p.totalPayable), 0);
  const spent = cashExpense + cashSubPayment + materialPaid + payrollTotal;

  // Công nợ NCC theo nhà cung cấp
  const supplierDebtMap = new Map<string, { name: string; amount: number }>();
  for (const d of debts) {
    if (d.paidAt) continue;
    const cur = supplierDebtMap.get(d.supplier.id) ?? { name: d.supplier.name, amount: 0 };
    cur.amount += Number(d.totalAmount);
    supplierDebtMap.set(d.supplier.id, cur);
  }
  const supplierDebts = Array.from(supplierDebtMap.values()).sort((a, b) => b.amount - a.amount);
  const supplierDebtTotal = supplierDebts.reduce((s, r) => s + r.amount, 0);

  // Công nợ thầu phụ theo HĐ
  const paidBySubContract = new Map<string, number>();
  for (const p of subPayments) {
    const v = Number(p.actualAmount ?? p.expectedAmount);
    paidBySubContract.set(p.subContractId, (paidBySubContract.get(p.subContractId) ?? 0) + v);
  }
  const subContractRows = subContracts.map((c) => {
    const paid = paidBySubContract.get(c.id) ?? 0;
    return {
      id: c.id,
      code: c.code,
      title: c.title,
      subcontractorName: c.subcontractor.name,
      contractValue: Number(c.contractValue),
      paid,
      debt: Math.max(0, Number(c.contractValue) - paid),
    };
  });
  const subDebtTotal = subContractRows.reduce((s, r) => s + r.debt, 0);

  return NextResponse.json({
    project: { id: project.id, code: project.code, name: project.name, status: project.status },
    revenue: {
      contractValue,
      collected,
      remaining: contractValue - collected,
      schedules: scheduleRows,
      extraReceipts,
    },
    cost: {
      spent,
      breakdown: {
        cashExpense,
        subPayment: cashSubPayment,
        material: materialPaid,
        payroll: payrollTotal,
      },
      byCategory: Array.from(byCategory.entries())
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount),
    },
    debt: {
      supplierTotal: supplierDebtTotal,
      suppliers: supplierDebts,
      subcontractorTotal: subDebtTotal,
      subContracts: subContractRows,
    },
    budget: budget
      ? {
          status: budget.status,
          totalLabor: Number(budget.totalLabor),
          totalMaterial: Number(budget.totalMaterial),
          totalEquipment: Number(budget.totalEquipment),
          totalAmount: Number(budget.totalAmount),
        }
      : null,
    grossProfit: collected - spent,
  });
}
