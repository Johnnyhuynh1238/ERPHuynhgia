import { Prisma, SubPaymentStatus, MhOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Ngân sách dòng tiền theo HẠNG MỤC ────────────────────────────────────────
// Mỗi hạng mục: Ngân sách · Đã chi · Công nợ · Còn phải chi.
//   Đã chi  = tiền đã ra khỏi quỹ cho hạng mục đó
//             (mua hàng: phần đã trả của đơn; thầu phụ: đợt đã trả; chi tay: expense/cash_txn gắn line).
//   Công nợ = đã phát sinh, chưa trả (mua hàng đơn mở; thầu phụ contractValue − đã trả).
//   Còn phải chi = Ngân sách − Đã chi − Công nợ (sàn 0; âm = vượt).

export type BudgetLineStat = {
  id: string;
  name: string;
  groupKind: string;
  budget: number;
  spent: number;
  debt: number;
  remaining: number; // budget − spent − debt (có thể âm = vượt)
  over: boolean;
};

export type BudgetPlanData = {
  exists: boolean;
  status: "draft" | "locked" | null;
  lockedAt: string | null;
  contractValue: number;
  // Doanh thu phụ lục phát sinh = Σ đợt thu type=addendum (giá bán khách đã duyệt).
  addendumRevenue: number;
  lines: BudgetLineStat[];
  // phần chi/nợ chưa gắn hạng mục (item thiếu hm / HĐ chưa gắn) — cần soát.
  unassigned: { spent: number; debt: number };
  totals: { budget: number; spent: number; debt: number; remaining: number };
};

const num = (d: Prisma.Decimal | number | bigint | null | undefined): number =>
  d == null ? 0 : Number(d);

const MH_ACTIVE: MhOrderStatus[] = [MhOrderStatus.ordered, MhOrderStatus.received, MhOrderStatus.paid];

export async function buildBudgetPlan(projectId: string): Promise<BudgetPlanData> {
  const [plan, project, orders, subContracts, expenses, addendumAgg] = await Promise.all([
    prisma.projectBudgetPlan.findUnique({
      where: { projectId },
      include: { lines: { orderBy: { sortRank: "asc" } } },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { contractValue: true } }),
    prisma.mhOrder.findMany({
      where: { projectId, status: { in: MH_ACTIVE } },
      select: { id: true, status: true, total: true, supplierId: true, budgetLineId: true },
    }),
    prisma.subContract.findMany({
      where: { projectId, status: { in: ["active", "completed"] }, budgetLineId: { not: null } },
      select: {
        id: true,
        contractValue: true,
        budgetLineId: true,
        payments: { select: { id: true, status: true, actualAmount: true, expectedAmount: true } },
      },
    }),
    // Chi tay gắn hạng mục (không thuộc mua hàng/thầu phụ) — đã trả.
    prisma.expense.findMany({
      where: {
        projectId,
        status: "paid",
        budgetLineId: { not: null },
        // Loại lệnh chi mua hàng/công nợ NCC (đã tính qua đơn/view). notIn loại luôn
        // source rỗng (NULL NOT IN → NULL) nên phải OR để giữ chi tay source rỗng.
        OR: [
          { sourceType: null },
          { sourceType: { notIn: ["mua_hang_order", "ncc_congno"] } },
        ],
      },
      select: { budgetLineId: true, paidAmount: true, amount: true },
    }),
    // Doanh thu phụ lục = tổng đợt thu type=addendum (mọi trạng thái đã lên lịch).
    prisma.paymentSchedule.aggregate({
      where: { projectId, type: "addendum" },
      _sum: { amount: true },
    }),
  ]);

  const addendumRevenue = num(addendumAgg._sum.amount);

  if (!plan) {
    return {
      exists: false,
      status: null,
      lockedAt: null,
      contractValue: num(project?.contractValue),
      addendumRevenue,
      lines: [],
      unassigned: { spent: 0, debt: 0 },
      totals: { budget: 0, spent: 0, debt: 0, remaining: 0 },
    };
  }

  // Mua hàng 2 loại: TRẢ NGAY (supplierId null) tính per đơn; CÔNG NỢ NCC
  // (supplierId set) trả gộp theo NCC → dùng view ncc_cong_no_du_an.
  const cashOrders = orders.filter((o) => !o.supplierId);
  const debtOrders = orders.filter((o) => o.supplierId);

  // Cọc/đã trả cho đơn TRẢ NGAY (expense mua_hang_order paid).
  const cashIds = cashOrders.map((o) => o.id);
  const depositRows = cashIds.length
    ? await prisma.expense.groupBy({
        by: ["sourceId"],
        where: { sourceType: "mua_hang_order", sourceId: { in: cashIds }, status: "paid" },
        _sum: { paidAmount: true },
      })
    : [];
  const depositMap = new Map(depositRows.map((r) => [r.sourceId, num(r._sum.paidAmount)]));

  // Công nợ NCC theo từng NCC (đã trả / còn lại — mô hình cộng dồn).
  const nccRows = await prisma.$queryRaw<
    { supplier_id: string; da_tra: number; con_lai: number }[]
  >`
    SELECT supplier_id, da_tra::float8 AS da_tra, con_lai::float8 AS con_lai
    FROM ncc_cong_no_du_an WHERE project_id = ${projectId}::uuid`;
  const nccMap = new Map(nccRows.map((r) => [r.supplier_id, r]));

  const spent = new Map<string, number>();
  const debt = new Map<string, number>();
  const add = (m: Map<string, number>, key: string | null | undefined, v: number) => {
    if (!key || v === 0) return;
    m.set(key, (m.get(key) ?? 0) + v);
  };
  const unassigned = { spent: 0, debt: 0 };

  // ── Mua hàng TRẢ NGAY: phân bổ đã trả (cọc/paid) & còn nợ theo HẠNG MỤC CỦA ĐƠN ──
  for (const o of cashOrders) {
    const total = num(o.total);
    if (total <= 0) continue;
    const paidOrder = o.status === MhOrderStatus.paid ? total : Math.min(total, depositMap.get(o.id) ?? 0);
    const owed = total - paidOrder;
    if (o.budgetLineId) {
      add(spent, o.budgetLineId, paidOrder);
      add(debt, o.budgetLineId, owed);
    } else {
      unassigned.spent += paidOrder;
      unassigned.debt += owed;
    }
  }

  // ── Mua hàng CÔNG NỢ NCC: gom theo NCC, phân bổ da_tra/con_lai theo tỉ trọng
  //    HẠNG MỤC CỦA ĐƠN (tổng đơn), không còn theo item. ──
  const debtBySupplier = new Map<string, typeof debtOrders>();
  for (const o of debtOrders) {
    const k = o.supplierId!;
    (debtBySupplier.get(k) ?? debtBySupplier.set(k, []).get(k)!).push(o);
  }
  for (const [supplierId, group] of Array.from(debtBySupplier.entries())) {
    // tỉ trọng theo hạng mục đơn (null = chưa gắn) trong toàn bộ đơn NCC.
    const weight = new Map<string | null, number>();
    let sumOrders = 0;
    for (const o of group) {
      const amt = num(o.total);
      if (amt <= 0) continue;
      const key = o.budgetLineId ?? null;
      // Đơn NCC đã 'paid' (trả ngay/tất toán riêng, không qua 'received') nằm
      // NGOÀI công nợ NCC — view ncc_cong_no_du_an chỉ theo dõi đơn 'received'.
      // Coi như đã chi thẳng, không đưa vào phân bổ nợ (nếu không sẽ hiện nợ ảo).
      if (o.status === MhOrderStatus.paid) {
        if (key) add(spent, key, amt);
        else unassigned.spent += amt;
        continue;
      }
      weight.set(key, (weight.get(key) ?? 0) + amt);
      sumOrders += amt;
    }
    if (sumOrders <= 0) continue;
    const ncc = nccMap.get(supplierId);
    // Nếu NCC không có trong view (chưa ghi công nợ) → coi toàn bộ là công nợ chưa trả.
    const paidNcc = ncc ? ncc.da_tra : 0;
    const owedNcc = ncc ? ncc.con_lai : sumOrders;
    for (const [key, w] of Array.from(weight.entries())) {
      const ratio = w / sumOrders;
      const sp = paidNcc * ratio;
      const dt = owedNcc * ratio;
      if (key) {
        add(spent, key, sp);
        add(debt, key, dt);
      } else {
        unassigned.spent += sp;
        unassigned.debt += dt;
      }
    }
  }

  // ── Thầu phụ: đã chi = Σ actualAmount các đợt chưa huỷ (gồm đợt paid + tạm ứng
  //    dở) — ĐỒNG NHẤT với màn Thầu phụ. Công nợ = contractValue − đã chi. ──
  for (const sc of subContracts) {
    const cv = num(sc.contractValue);
    const paid = sc.payments.reduce(
      (s, p) => (p.status === SubPaymentStatus.cancelled ? s : s + num(p.actualAmount)),
      0,
    );
    add(spent, sc.budgetLineId, paid);
    add(debt, sc.budgetLineId, Math.max(0, cv - paid));
  }

  // ── Chi tay / chi chung gắn hạng mục (lệnh chi đã trả) ──
  for (const e of expenses) add(spent, e.budgetLineId, num(e.paidAmount ?? e.amount));

  const lines: BudgetLineStat[] = plan.lines.map((l) => {
    const budget = Number(l.amount);
    const sp = spent.get(l.id) ?? 0;
    const dt = debt.get(l.id) ?? 0;
    const remaining = budget - sp - dt;
    return {
      id: l.id,
      name: l.name,
      groupKind: l.groupKind,
      budget,
      spent: Math.round(sp),
      debt: Math.round(dt),
      remaining: Math.round(remaining),
      over: remaining < -0.5,
    };
  });

  const totals = lines.reduce(
    (a, l) => ({
      budget: a.budget + l.budget,
      spent: a.spent + l.spent,
      debt: a.debt + l.debt,
      // Chỉ cộng phần CHƯA chi đủ; hạng mục vượt (âm) không bù ngược vào tổng.
      remaining: a.remaining + Math.max(0, l.remaining),
    }),
    { budget: 0, spent: 0, debt: 0, remaining: 0 },
  );

  return {
    exists: true,
    status: plan.status,
    lockedAt: plan.lockedAt ? plan.lockedAt.toISOString() : null,
    contractValue: num(project?.contractValue),
    addendumRevenue,
    lines,
    unassigned: { spent: Math.round(unassigned.spent), debt: Math.round(unassigned.debt) },
    totals,
  };
}
