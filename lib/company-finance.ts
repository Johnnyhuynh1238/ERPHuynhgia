import { prisma } from "@/lib/prisma";
import { buildCashPlan, type CashRow } from "@/lib/cash-plan";
import { PAID_EXPENSE, PENDING_EXPENSE, PENDING_RECEIPT, RECEIVED_RECEIPT, summarizeLoan } from "@/lib/debts";

// Danh mục chi KHÔNG phải chi phí: trả nợ gốc (giảm nợ) + chi tạm ứng (tiền sẽ hoàn).
export const NON_COST_CATEGORY_CODES = ["TRANOGOC", "TAMUNG"];
// Danh mục chi chung công ty (chi phí quản lý) — để tính tỷ lệ chi chung / doanh thu.
const OVERHEAD_CODES = ["LUONGQL", "VANPHONG", "VANHANH", "MARKETING", "TIEPKHACH", "XANGDAU", "LAIVAY"];

const DAY_MS = 86_400_000;
const EPS = 1;

export type Pnl = { customer: number; otherIn: number; income: number; cost: number; profit: number; margin: number | null };
export type Insight = { level: "bad" | "warn" | "good" | "info"; title: string; detail: string };
export type DueItem = { title: string; project: string | null; amount: number; date: string | null };

export type CompanyFinance = {
  today: string;
  pnl: { month: Pnl; lastMonth: Pnl; year: Pnl; all: Pnl };
  monthly: { ym: string; income: number; cost: number; profit: number }[];
  bridge: {
    customer: number;
    otherIn: number;
    cost: number;
    loanIn: number;
    principalPaid: number;
    advanceOut: number;
    advanceReturned: number;
    cash: number;
  };
  position: {
    cash: number;
    advances: number;
    receivableDue: number;
    loans: number;
    ncc: number;
    payableDue: number;
    netNow: number;
    receivableLater: number;
    payableLater: number;
    netProjected: number;
  };
  forecast30: { inflow: number; outflow: number; endCash: number; lowestCash: number; firstNegative: string | null; undatedOut: number };
  loans: { lender: string; code: string; outstanding: number; rate: number | null; interestPaid: number }[];
  overdueIn: DueItem[];
  insights: Insight[];
};

type FlowRow = { ym: string; k: string; code: string | null; amt: number };

const todayVn = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const addDays = (s: string, n: number) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const fmtM = (n: number) =>
  Math.abs(n) >= 1e9
    ? `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`
    : `${Math.round(n / 1e6).toLocaleString("vi-VN")} tr`;
const fmtD = (s: string) => s.split("-").reverse().join("/");

function makePnl(rows: FlowRow[]): Pnl {
  let customer = 0;
  let otherIn = 0;
  let cost = 0;
  for (const r of rows) {
    if (r.k === "customer") customer += r.amt;
    else if (r.k === "other_in") otherIn += r.amt;
    else if (r.k === "cost") cost += r.amt;
  }
  const income = customer + otherIn;
  return { customer, otherIn, income, cost, profit: income - cost, margin: income > 0 ? (income - cost) / income : null };
}

// Các mốc (ngày, số tiền) đã lên kế hoạch của 1 khoản trong Kế hoạch thu-chi.
function planEntries(r: CashRow): { date: string | null; amount: number }[] {
  if (!r.hasTotal) return [{ date: r.nativeDate, amount: r.total }];
  const out = r.chunks.map((c) => ({ date: c.plannedDate, amount: c.amount }));
  const rest = Math.max(0, r.total - r.chunks.reduce((s, c) => s + c.amount, 0));
  if (rest > EPS) out.push({ date: r.nativeDate, amount: rest });
  return out;
}

// Tổng hợp tài chính công ty: lãi/lỗ theo dòng tiền thật, vị thế nợ/dư, dự báo 30 ngày, đề xuất.
// Lãi/lỗ = thu từ khách (+ thu khác) − chi phí sổ quỹ (bỏ chuyển quỹ, vay vào, hoàn ứng, trả gốc, tạm ứng).
export async function buildCompanyFinance(): Promise<CompanyFinance> {
  const today = todayVn();
  const curYm = today.slice(0, 7);

  const [flows, plan, loans, cats] = await Promise.all([
    prisma.$queryRaw<FlowRow[]>`
      SELECT to_char((t.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS ym,
        CASE
          WHEN t.direction = 'in' AND r.source::text = 'loan' THEN 'loan_in'
          WHEN t.direction = 'in' AND r.source::text = 'advance_return' THEN 'adv_ret'
          WHEN t.direction = 'in' AND r.source::text IN ('other', 'supplier_refund') THEN 'other_in'
          WHEN t.direction = 'in' THEN 'customer'
          WHEN c.code = 'TRANOGOC' THEN 'principal'
          WHEN c.code = 'TAMUNG' THEN 'adv_out'
          ELSE 'cost'
        END AS k,
        CASE WHEN t.direction = 'out' THEN c.code END AS code,
        SUM(t.amount)::float8 AS amt
      FROM cash_transactions t
      LEFT JOIN receipts r ON t.ref_type = 'receipt' AND r.id = t.ref_id
      LEFT JOIN expense_categories c ON c.id = t.category_id
      WHERE t.ref_type <> 'transfer'
      GROUP BY 1, 2, 3`,
    buildCashPlan(),
    prisma.loan.findMany({
      where: { status: "active" },
      include: {
        expenses: {
          where: { status: { in: [PAID_EXPENSE, ...PENDING_EXPENSE] } },
          select: { amount: true, status: true, category: { select: { code: true } } },
        },
        receipts: {
          where: { status: { in: [RECEIVED_RECEIPT, ...PENDING_RECEIPT] } },
          select: { amount: true, status: true },
        },
      },
    }),
    prisma.expenseCategory.findMany({ select: { code: true, name: true } }),
  ]);
  const catName = new Map(cats.map((c) => [c.code, c.name]));

  /* ── Lãi / lỗ ── */
  const lastYm = shiftMonth(curYm, -1);
  const pnl = {
    month: makePnl(flows.filter((r) => r.ym === curYm)),
    lastMonth: makePnl(flows.filter((r) => r.ym === lastYm)),
    year: makePnl(flows.filter((r) => r.ym.startsWith(today.slice(0, 4)))),
    all: makePnl(flows),
  };
  const monthly = Array.from({ length: 6 }, (_, i) => shiftMonth(curYm, i - 5)).map((ym) => {
    const p = makePnl(flows.filter((r) => r.ym === ym));
    return { ym, income: p.income, cost: p.cost, profit: p.profit };
  });

  const sumK = (k: string) => flows.filter((r) => r.k === k).reduce((s, r) => s + r.amt, 0);
  const bridge = {
    customer: pnl.all.customer,
    otherIn: pnl.all.otherIn,
    cost: pnl.all.cost,
    loanIn: sumK("loan_in"),
    principalPaid: sumK("principal"),
    advanceOut: sumK("adv_out"),
    advanceReturned: sumK("adv_ret"),
    cash: plan.balance,
  };

  /* ── Vị thế nợ / dư (nguồn = Kế hoạch thu-chi) ── */
  const isDue = (d: string | null) => !!d && d <= today;
  let advances = 0;
  let receivableDue = 0;
  let receivableLater = 0;
  const overdueIn: DueItem[] = [];
  for (const r of plan.in) {
    if (r.sourceType === "advance") {
      advances += r.total;
      continue;
    }
    for (const e of planEntries(r)) {
      if (isDue(e.date)) {
        receivableDue += e.amount;
        if (e.date! < today) overdueIn.push({ title: r.title, project: r.projectLabel, amount: e.amount, date: e.date });
      } else receivableLater += e.amount;
    }
  }
  let loansOut = 0;
  let ncc = 0;
  let payableDue = 0;
  let payableLater = 0;
  for (const r of plan.out) {
    if (r.sourceType === "loan_principal") loansOut += r.total;
    else if (r.sourceType === "ncc_congno") ncc += r.total;
    else for (const e of planEntries(r)) (isDue(e.date) ? (payableDue += e.amount) : (payableLater += e.amount));
  }
  const netNow = plan.balance + advances + receivableDue - loansOut - ncc - payableDue;
  const netProjected = netNow + receivableLater - payableLater;
  overdueIn.sort((a, b) => b.amount - a.amount);

  /* ── Dự báo quỹ 30 ngày (khoản quá hạn coi như dồn về hôm nay) ── */
  const horizon = addDays(today, 30);
  const daily = new Map<string, number>();
  let inflow = 0;
  let outflow = 0;
  let undatedOut = 0;
  const pushFlow = (rows: CashRow[], sign: 1 | -1) => {
    for (const r of rows) {
      for (const e of planEntries(r)) {
        if (!e.date) {
          if (sign < 0) undatedOut += e.amount;
          continue;
        }
        if (e.date > horizon) continue;
        const d = e.date < today ? today : e.date;
        daily.set(d, (daily.get(d) ?? 0) + sign * e.amount);
        if (sign > 0) inflow += e.amount;
        else outflow += e.amount;
      }
    }
  };
  pushFlow(plan.in, 1);
  pushFlow(plan.out, -1);
  let run = plan.balance;
  let lowestCash = run;
  let firstNegative: string | null = run < 0 ? today : null;
  for (const d of Array.from(daily.keys()).sort()) {
    run += daily.get(d)!;
    if (run < lowestCash) lowestCash = run;
    if (run < 0 && !firstNegative) firstNegative = d;
  }

  const loanRows = loans
    .map((l) => {
      const s = summarizeLoan(l);
      return { lender: l.lender, code: l.code, outstanding: s.outstanding, rate: l.interestRate == null ? null : Number(l.interestRate), interestPaid: s.interestPaid };
    })
    .filter((l) => l.outstanding > EPS)
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.outstanding - a.outstanding);

  /* ── Phân tích & đề xuất (quy tắc) ── */
  const insights: Insight[] = [];
  const costByCode = (rows: FlowRow[]) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.k === "cost") m.set(r.code ?? "(trống)", (m.get(r.code ?? "(trống)") ?? 0) + r.amt);
    return m;
  };

  // 1) Lãi/lỗ lũy kế + tháng này.
  if (pnl.all.profit < 0) {
    insights.push({
      level: "bad",
      title: `Từ đầu đến nay chi nhiều hơn thu ${fmtM(-pnl.all.profit)}`,
      detail: `Thu từ khách ${fmtM(pnl.all.income)}, chi phí ${fmtM(pnl.all.cost)}. Phần thiếu đang bù bằng tiền vay (đã nhận vay ${fmtM(bridge.loanIn)}, trả gốc ${fmtM(bridge.principalPaid)}). Đây là lãi/lỗ theo dòng tiền: công trình đang chạy thường chi trước thu sau, nên xem thêm phần "Dự kiến khi hoàn tất HĐ" ở trên.`,
    });
  } else {
    insights.push({
      level: "good",
      title: `Từ đầu đến nay thu nhiều hơn chi ${fmtM(pnl.all.profit)}`,
      detail: `Biên lãi dòng tiền ${((pnl.all.margin ?? 0) * 100).toFixed(1)}% trên tổng thu ${fmtM(pnl.all.income)}.`,
    });
  }
  if (pnl.month.cost > 0 || pnl.month.income > 0) {
    const top = Array.from(costByCode(flows.filter((r) => r.ym === curYm)).entries()).sort((a, b) => b[1] - a[1])[0];
    insights.push({
      level: pnl.month.profit >= 0 ? "good" : "warn",
      title: `Tháng này ${pnl.month.profit >= 0 ? "dương" : "âm"} ${fmtM(Math.abs(pnl.month.profit))}`,
      detail: `Thu ${fmtM(pnl.month.income)} · chi phí ${fmtM(pnl.month.cost)}${top ? ` · khoản chi lớn nhất: ${catName.get(top[0]) ?? top[0]} ${fmtM(top[1])}` : ""}.`,
    });
  }

  // 2) Vị thế nợ ròng.
  if (netNow < 0) {
    insights.push({
      level: "bad",
      title: `Đang nợ ròng ${fmtM(-netNow)}`,
      detail: `Tiền quỹ + khách nợ đến hạn + tạm ứng chưa hoàn không đủ trả vay ${fmtM(loansOut)}, nợ NCC ${fmtM(ncc)} và các khoản đến hạn ${fmtM(payableDue)}. ${netProjected >= 0 ? `Nếu thu đủ các đợt HĐ còn lại thì sẽ dư ${fmtM(netProjected)} — ưu tiên đốc thu.` : `Kể cả thu hết các đợt HĐ còn lại vẫn âm ${fmtM(-netProjected)} — cần ký thêm HĐ hoặc cắt chi.`}`,
    });
  }

  // 3) Quỹ đủ chi bao lâu (chi phí bình quân 3 tháng gần nhất đã qua).
  const last3 = [1, 2, 3].map((i) => shiftMonth(curYm, -i));
  const avgCost = last3.reduce((s, ym) => s + makePnl(flows.filter((r) => r.ym === ym)).cost, 0) / 3;
  if (avgCost > 0) {
    const days = Math.floor((plan.balance / avgCost) * 30);
    insights.push({
      level: days < 15 ? "bad" : days < 45 ? "warn" : "good",
      title: `Quỹ hiện tại đủ chi khoảng ${Math.max(0, days)} ngày`,
      detail: `Quỹ ${fmtM(plan.balance)} so với chi phí bình quân ${fmtM(avgCost)}/tháng (3 tháng gần nhất).${days < 45 ? " Nên giữ quỹ tối thiểu bằng 1 tháng chi phí." : ""}`,
    });
  }

  // 4) Dự báo 30 ngày.
  if (firstNegative) {
    insights.push({
      level: "bad",
      title: `Quỹ dự kiến âm từ ${fmtD(firstNegative)}`,
      detail: `Theo Kế hoạch thu-chi 30 ngày tới: thu ${fmtM(inflow)}, chi ${fmtM(outflow)}, đáy quỹ ${fmtM(lowestCash)}. Đề xuất: ${overdueIn.length ? "đốc thu các đợt quá hạn, " : "xin khách tạm ứng sớm đợt kế tiếp, "}dời các khoản chi chưa gấp, hoặc thương lượng giãn nợ NCC/thầu phụ.`,
    });
  } else if (inflow + outflow > 0) {
    insights.push({
      level: "good",
      title: "30 ngày tới quỹ không bị âm",
      detail: `Thu dự kiến ${fmtM(inflow)}, chi dự kiến ${fmtM(outflow)}, quỹ cuối kỳ ${fmtM(plan.balance + inflow - outflow)}.`,
    });
  }
  if (undatedOut > EPS) {
    insights.push({
      level: "info",
      title: `${fmtM(undatedOut)} phải trả chưa có ngày trong Kế hoạch thu-chi`,
      detail: "Các khoản này chưa nằm trong dự báo 30 ngày. Nên lên ngày ở màn Kế hoạch thu-chi để dự báo sát hơn.",
    });
  }

  // 5) Khách nợ quá hạn.
  if (overdueIn.length) {
    const sum = overdueIn.reduce((s, x) => s + x.amount, 0);
    insights.push({
      level: "warn",
      title: `${overdueIn.length} đợt thu quá hạn, tổng ${fmtM(sum)}`,
      detail: `Cần đốc thu ngay: ${overdueIn.slice(0, 3).map((x) => `${x.project ?? x.title} ${fmtM(x.amount)} (hạn ${fmtD(x.date!)})`).join("; ")}.`,
    });
  }

  // 6) Khoản vay.
  if (loanRows.length) {
    const noRate = loanRows.filter((l) => l.rate == null);
    const withRate = loanRows.filter((l) => l.rate != null);
    const monthlyInterest = withRate.reduce((s, l) => s + (l.outstanding * (l.rate ?? 0)) / 100 / 12, 0);
    insights.push({
      level: "info",
      title: `Đang vay ${fmtM(loansOut)} (${loanRows.length} khoản)`,
      detail: [
        withRate.length
          ? `Lãi ước tính ~${fmtM(monthlyInterest)}/tháng. Có tiền dư nên trả trước khoản lãi cao nhất: ${withRate[0].lender} (${withRate[0].rate}%/năm, còn ${fmtM(withRate[0].outstanding)}).`
          : "",
        noRate.length ? `${noRate.length} khoản chưa nhập lãi suất (${noRate.map((l) => l.lender).join(", ")}) — nhập ở màn Vay & Tạm ứng để tính chi phí lãi.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  // Vay ròng theo sổ quỹ lệch dư nợ ở màn Vay → trả nợ ghi sai danh mục hoặc khoản vay chưa tạo.
  const loanGap = bridge.loanIn - bridge.principalPaid - loansOut;
  if (Math.abs(loanGap) > 10_000_000) {
    insights.push({
      level: "warn",
      title: `Sổ quỹ và màn Vay lệch nhau ${fmtM(Math.abs(loanGap))}`,
      detail: `Sổ quỹ: nhận vay ${fmtM(bridge.loanIn)} − trả gốc ${fmtM(bridge.principalPaid)} = ${fmtM(bridge.loanIn - bridge.principalPaid)}, nhưng màn Vay & Tạm ứng chỉ còn nợ ${fmtM(loansOut)}. ${loanGap > 0 ? `Có thể phần trả nợ đang ghi ở danh mục "Khác" (khi đó chi phí và khoản lỗ đang bị tính cao hơn thực tế) — nên đối chiếu và chuyển sang "Trả nợ gốc".` : "Có thể còn khoản vay chưa ghi nhận tiền vào sổ quỹ — nên đối chiếu."}`,
    });
  }

  // 7) Tạm ứng chưa hoàn.
  if (advances > EPS) {
    insights.push({
      level: "info",
      title: `Tạm ứng chưa hoàn ${fmtM(advances)}`,
      detail: "Đề xuất quyết toán: thu hồi tiền thừa hoặc lập chứng từ chi phí cho phần đã tiêu.",
    });
  }

  // 8) Chi chung công ty / doanh thu năm nay + danh mục "Khác".
  const yearCost = costByCode(flows.filter((r) => r.ym.startsWith(today.slice(0, 4))));
  const overhead = OVERHEAD_CODES.reduce((s, c) => s + (yearCost.get(c) ?? 0), 0);
  if (pnl.year.income > 0 && overhead > 0) {
    const ratio = overhead / pnl.year.income;
    insights.push({
      level: ratio > 0.15 ? "warn" : "good",
      title: `Chi phí quản lý năm nay = ${(ratio * 100).toFixed(1)}% doanh thu`,
      detail: `${fmtM(overhead)} (lương QL, văn phòng, vận hành, xăng dầu, tiếp khách, marketing, lãi vay)${ratio > 0.15 ? " — cao hơn mức nên giữ (~10–15%), xem lại các khoản cố định." : "."}`,
    });
  }
  const other = yearCost.get("KHAC") ?? 0;
  if (pnl.year.cost > 0 && other / pnl.year.cost > 0.1) {
    insights.push({
      level: "warn",
      title: `Danh mục "Khác" chiếm ${((other / pnl.year.cost) * 100).toFixed(0)}% chi phí năm nay`,
      detail: `${fmtM(other)} chưa rõ đi về đâu. Nên phân loại lại (vật tư, thầu phụ, nhân công…) để biểu đồ và phân tích lãi theo công trình chính xác hơn.`,
    });
  }

  const order = { bad: 0, warn: 1, info: 2, good: 3 };
  insights.sort((a, b) => order[a.level] - order[b.level]);

  return {
    today,
    pnl,
    monthly,
    bridge,
    position: { cash: plan.balance, advances, receivableDue, loans: loansOut, ncc, payableDue, netNow, receivableLater, payableLater, netProjected },
    forecast30: { inflow, outflow, endCash: plan.balance + inflow - outflow, lowestCash, firstNegative, undatedOut },
    loans: loanRows,
    overdueIn: overdueIn.slice(0, 8),
    insights,
  };
}
