import { prisma } from "@/lib/prisma";

// Tóm tắt tài chính 1 dự án cho header đầu màn dự án (admin/kế toán).
// Cùng ngữ nghĩa với app/api/projects/[id]/finance để số khớp trang Tài chính:
//   Thu   = các đợt PaymentSchedule đã thu + receipt customer ngoài đợt.
//   Chi   = sổ quỹ gắn dự án (out, gồm cả khoản trả NCC) + lương thợ đã trả.
//   Nợ NCC = mô hình CỘNG DỒN theo dự án: SUM nợ − SUM đã trả (view ncc_cong_no_du_an),
//            trả đủ thì nợ = 0. Không track từng đơn hàng đã trả hay chưa.
//   "Đến hiện tại" = Thực chi + Nợ NCC còn lại (chi phí đã phát sinh, gồm cả phần còn nợ).
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
  const [project, schedules, extraReceipts, cashOut, payrolls, khoanAgg, matRows, debtRows] =
    await Promise.all([
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
      prisma.weeklyPayroll.findMany({ where: { projectId, status: "paid" }, select: { totalPayable: true } }),
      // Dự toán mới (app /du-toan) — bảng 1: khoán trọn gói, tổng = SUM(value).
      prisma.estimateDbKhoan.aggregate({ where: { projectId }, _sum: { value: true } }),
      // Dự toán mới — bảng 2: vật tư, thành tiền = quantity × unit_price (tính runtime).
      prisma.$queryRaw<{ total: number }[]>`
        SELECT COALESCE(SUM(quantity * unit_price), 0)::float8 AS total
        FROM estimate_db_materials WHERE project_id = ${projectId}::uuid`,
      // Nợ NCC còn lại (cộng dồn theo dự án): SUM(nợ − đã trả), sàn 0 mỗi NCC.
      prisma.$queryRaw<{ con_lai: number }[]>`
        SELECT COALESCE(SUM(con_lai), 0)::float8 AS con_lai
        FROM ncc_cong_no_du_an WHERE project_id = ${projectId}::uuid`,
    ]);

  const contractValue = Number(project?.contractValue ?? 0);

  const collectedSchedules = schedules.reduce((s, r) => {
    const done = r.status === "collected" || r.status === "paid";
    return s + (done ? Number(r.actualPaidAmount ?? r.paidAmount ?? r.amount) : 0);
  }, 0);
  const collectedExtra = extraReceipts.reduce((s, r) => s + Number(r.receivedAmount ?? r.amount), 0);
  const collected = collectedSchedules + collectedExtra;

  // Thực chi = sổ quỹ gắn dự án (đã gồm khoản trả NCC ghi song song) + lương đã trả.
  const cashSpent = cashOut.reduce((s, t) => s + Number(t.amount), 0);
  const payrollTotal = payrolls.reduce((s, p) => s + Number(p.totalPayable), 0);
  const spent = cashSpent + payrollTotal;

  const supplierDebt = Number(debtRows[0]?.con_lai ?? 0);
  const incurred = spent + supplierDebt;

  // Tổng dự toán: chỉ lấy từ app /du-toan mới (khoán trọn gói + vật tư). Trống → null ("—").
  const duToanKhoan = Number(khoanAgg._sum.value ?? 0);
  const duToanMaterial = Number(matRows[0]?.total ?? 0);
  const duToanNew = duToanKhoan + duToanMaterial;
  const budgetTotal = duToanNew > 0 ? duToanNew : null;
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
