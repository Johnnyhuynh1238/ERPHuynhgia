import { PaymentStatus, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildCashPlan } from "@/lib/cash-plan";
import { buildBudgetPlan } from "@/lib/budget-plan";
import { NON_COST_CATEGORY_CODES } from "@/lib/company-finance";

// Dự báo "đến khi xong các HĐ đang chạy" (anh chốt cách tính 12/10/2026):
//   Cuối kỳ = Nợ ròng hiện tại (quỹ − vay − nợ dự án đã xong + khách nợ dự án đã xong)
//           + Σ (còn thu − còn phải chi) từng HĐ đang chạy
//           − chi phí chung/tháng × số tháng đến ngày xong HĐ trễ nhất.
// HĐ có ngân sách → vốn = ngân sách (dòng vượt lấy số thực chi + nợ); chưa có → GIẢ ĐỊNH lãi gộp 25%.
// Tạm ứng chưa hoàn và đợt thu bảo hành (thu sau 12 tháng) KHÔNG tính.
export const ASSUMED_MARGIN = 0.25;
const DEBT_SOURCES = new Set(["sub_payment", "mh_order", "ncc_congno", "sub_debt"]);
const WARRANTY_RE = /bảo hành|sau 12 tháng/i;
const DAY_MS = 86_400_000;

export { OVERHEAD_GROUPS } from "@/lib/company-overhead-groups";

export type OverheadItem = { id: string; name: string; groupKey: string; monthlyAmount: number; note: string | null; sortOrder: number };

export type ProjectForecast = {
  id: string;
  code: string;
  name: string;
  endDate: string;
  revenue: number;
  collected: number;
  remainingIn: number;
  warrantyIn: number;
  cost: number;
  gross: number;
  margin: number | null;
  costSource: "budget" | "assumed";
  budgetStatus: "draft" | "locked" | null;
  spent: number;
  debt: number;
  remainingOut: number;
  net: number;
};

export type FinishedProject = { code: string; name: string; debt: number; receivable: number };

export type CompanyForecast = {
  today: string;
  horizonEnd: string;
  months: number;
  base: { cash: number; loans: number; finishedDebt: number; finishedReceivable: number; otherDebt: number; total: number };
  finished: FinishedProject[];
  projects: ProjectForecast[];
  overhead: { items: OverheadItem[]; monthly: number; total: number };
  advances: number;
  end: number;
  assumedRevenue: number;
  scenarios: { margin: number; end: number }[];
  breakEvenMargin: number | null;
};

const todayVn = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const n = (v: unknown) => (v == null ? 0 : Number(v));

export async function buildCompanyForecast(): Promise<CompanyForecast> {
  const today = todayVn();
  const [plan, projects, schedules, overheadRows, spentRows] = await Promise.all([
    buildCashPlan(),
    prisma.project.findMany({
      where: { OR: [{ contractValue: { gt: 0 } }, { status: { not: ProjectStatus.completed } }] },
      select: { id: true, code: true, name: true, status: true, contractValue: true, expectedEndDate: true },
    }),
    prisma.paymentSchedule.findMany({
      where: { status: { not: PaymentStatus.cancelled } },
      select: { projectId: true, amount: true, status: true, actualPaidAmount: true, paidAmount: true, milestoneDescription: true, description: true },
    }),
    prisma.companyOverheadItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.cashTransaction.groupBy({
      by: ["projectId"],
      where: {
        direction: "out",
        refType: "expense",
        projectId: { not: null },
        OR: [{ categoryId: null }, { category: { code: { notIn: NON_COST_CATEGORY_CODES } } }],
      },
      _sum: { amount: true },
    }),
  ]);

  // Thu theo đợt: đã thu / còn thu / bảo hành.
  const recv = new Map<string, { collected: number; remaining: number; warranty: number }>();
  for (const s of schedules) {
    const r = recv.get(s.projectId) ?? { collected: 0, remaining: 0, warranty: 0 };
    const amount = n(s.amount);
    const paid = s.status === PaymentStatus.collected || s.status === PaymentStatus.paid ? amount : n(s.actualPaidAmount ?? s.paidAmount);
    r.collected += paid;
    const left = Math.max(0, amount - paid);
    if (WARRANTY_RE.test(`${s.milestoneDescription} ${s.description ?? ""}`)) r.warranty += left;
    else r.remaining += left;
    recv.set(s.projectId, r);
  }

  // Nợ / cam kết phải trả theo dự án (NCC, thầu phụ, mua hàng) + dư nợ vay + tạm ứng.
  const debtBy = new Map<string | null, number>();
  let loans = 0;
  let advances = 0;
  for (const r of plan.out) {
    if (r.sourceType === "loan_principal") loans += r.total;
    else if (DEBT_SOURCES.has(r.sourceType)) debtBy.set(r.projectId, (debtBy.get(r.projectId) ?? 0) + r.total);
  }
  for (const r of plan.in) if (r.sourceType === "advance") advances += r.total;
  const spentBy = new Map(spentRows.map((r) => [r.projectId, n(r._sum.amount)]));

  // Dự án đã xong → gộp vào nợ ròng hiện tại.
  const finished: FinishedProject[] = projects
    .filter((p) => p.status === ProjectStatus.completed)
    .map((p) => ({ code: p.code, name: p.name, debt: debtBy.get(p.id) ?? 0, receivable: recv.get(p.id)?.remaining ?? 0 }))
    .filter((p) => p.debt > 0.5 || p.receivable > 0.5);
  const knownIds = new Set(projects.map((p) => p.id));
  let otherDebt = debtBy.get(null) ?? 0;
  for (const [pid, v] of Array.from(debtBy.entries())) if (pid && !knownIds.has(pid)) otherDebt += v;

  // HĐ đang chạy.
  const running = projects.filter((p) => p.status !== ProjectStatus.completed && n(p.contractValue) > 0);
  const projectRows: ProjectForecast[] = [];
  for (const p of running) {
    const r = recv.get(p.id) ?? { collected: 0, remaining: 0, warranty: 0 };
    const bp = await buildBudgetPlan(p.id);
    const revenue = n(p.contractValue) + bp.addendumRevenue;
    const base = {
      id: p.id,
      code: p.code,
      name: p.name,
      endDate: p.expectedEndDate.toISOString().slice(0, 10),
      revenue,
      collected: r.collected,
      remainingIn: r.remaining,
      warrantyIn: r.warranty,
    };
    if (bp.exists && bp.totals.budget > 0) {
      const spent = bp.totals.spent + bp.unassigned.spent;
      const debt = bp.totals.debt + bp.unassigned.debt;
      const remainingOut = debt + bp.totals.remaining;
      const cost = spent + remainingOut;
      projectRows.push({
        ...base,
        cost,
        gross: revenue - cost,
        margin: revenue > 0 ? (revenue - cost) / revenue : null,
        costSource: "budget",
        budgetStatus: bp.status,
        spent,
        debt,
        remainingOut,
        net: r.remaining - remainingOut,
      });
    } else {
      const cost = revenue * (1 - ASSUMED_MARGIN);
      const spent = spentBy.get(p.id) ?? 0;
      const debt = debtBy.get(p.id) ?? 0;
      const remainingOut = Math.max(cost - spent, debt);
      projectRows.push({
        ...base,
        cost,
        gross: revenue - cost,
        margin: ASSUMED_MARGIN,
        costSource: "assumed",
        budgetStatus: null,
        spent,
        debt,
        remainingOut,
        net: r.remaining - remainingOut,
      });
    }
  }
  projectRows.sort((a, b) => a.endDate.localeCompare(b.endDate));

  // Số tháng gánh chi phí chung = từ hôm nay đến ngày xong HĐ trễ nhất (tối thiểu 1 tháng).
  const horizonEnd = projectRows.reduce((m, p) => (p.endDate > m ? p.endDate : m), today);
  const days = (new Date(`${horizonEnd}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY_MS;
  const months = Math.max(1, Math.round((days / 30.44) * 10) / 10);

  const items: OverheadItem[] = overheadRows.map((o) => ({
    id: o.id,
    name: o.name,
    groupKey: o.groupKey,
    monthlyAmount: n(o.monthlyAmount),
    note: o.note,
    sortOrder: o.sortOrder,
  }));
  const monthly = items.reduce((s, i) => s + i.monthlyAmount, 0);
  const overheadTotal = monthly * months;

  const finishedDebt = finished.reduce((s, p) => s + p.debt, 0);
  const finishedReceivable = finished.reduce((s, p) => s + p.receivable, 0);
  const baseTotal = plan.balance - loans - finishedDebt - otherDebt + finishedReceivable;
  const end = baseTotal + projectRows.reduce((s, p) => s + p.net, 0) - overheadTotal;

  // Kịch bản lãi gộp cho các HĐ đang GIẢ ĐỊNH (HĐ có ngân sách giữ nguyên).
  const assumedRevenue = projectRows.filter((p) => p.costSource === "assumed").reduce((s, p) => s + p.revenue, 0);
  const scenarios = assumedRevenue > 0 ? [0.2, 0.25, 0.3].map((m) => ({ margin: m, end: end + assumedRevenue * (m - ASSUMED_MARGIN) })) : [];
  const breakEvenMargin = assumedRevenue > 0 ? ASSUMED_MARGIN - end / assumedRevenue : null;

  return {
    today,
    horizonEnd,
    months,
    base: { cash: plan.balance, loans, finishedDebt, finishedReceivable, otherDebt, total: baseTotal },
    finished,
    projects: projectRows,
    overhead: { items, monthly, total: overheadTotal },
    advances,
    end,
    assumedRevenue,
    scenarios,
    breakEvenMargin,
  };
}
