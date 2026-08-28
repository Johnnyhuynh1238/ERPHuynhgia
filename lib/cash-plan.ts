import {
  Prisma,
  SubPaymentStatus,
  MhOrderStatus,
  LoanStatus,
  AdvanceStatus,
  PaymentStatus,
  CashPlanStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { summarizeLoan, summarizeAdvance } from "@/lib/debts";

// ── Kiểu dữ liệu trả về cho màn Kế hoạch thu/chi ─────────────────────────────

export type CashDir = "out" | "in";

/** Một đợt kế hoạch tự chia / nhập tay (bản ghi cash_plan_items). */
export type PlanChunk = {
  id: string;
  plannedDate: string | null; // yyyy-mm-dd; null = chưa lên kế hoạch (self-entry)
  amount: number;
  note: string | null;
  title: string | null;
  recurGroupId: string | null;
};

/**
 * Một "khoản" trên màn. Gồm 2 loại:
 *  - Source-backed (mua hàng / nợ gốc / tạm ứng): có `total` từ nguồn, chia đợt = chunks,
 *    phần còn lại = total − Σchunks (nếu có `nativeDate` thì tự nằm timeline ở ngày đó).
 *  - Native-only (thầu phụ đợt / đợt thu HĐ): cả khoản = 1 dòng ở `nativeDate`, sửa ngày = PATCH nguồn.
 *  - Self-entry (lãi vay / lương / nhập tay): mỗi bản ghi cash_plan_items là 1 dòng, sửa = PATCH item.
 */
export type CashRow = {
  key: string;
  direction: CashDir;
  sourceType: string; // sub_payment | payment_schedule | mh_order | loan_principal | loan_interest | salary | advance | manual
  sourceId: string | null;
  projectId: string | null;
  projectLabel: string | null;
  title: string;
  subtitle: string | null;
  total: number;
  hasTotal: boolean; // false = mở (lãi vay / lương / nhập tay) — không tính chưa-KH theo tổng
  canSplit: boolean; // cho phép admin chia nhiều đợt
  nativeDate: string | null; // ngày gốc ở nguồn; sửa = PATCH nguồn
  nativeEditable: boolean; // true = nativeDate ghi ngược về nguồn (đồng bộ 2 chiều)
  chunks: PlanChunk[];
  planned: number; // Σ đã lên kế hoạch (chunks có ngày + phần còn lại nếu nativeDate có)
  unplanned: number; // total − planned (chỉ khi hasTotal)
  selfItemId: string | null; // với self-entry: id bản ghi để PATCH ngày trực tiếp
};

export type CashPlanData = {
  balance: number; // số dư quỹ hiện tại (điểm xuất phát luỹ kế)
  out: CashRow[];
  in: CashRow[];
};

const toDate = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;
const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : Number(d);
const EPS = 1;

// Nguồn CHI đang treo (chưa hoàn tất) — tính vào kế hoạch.
const SUBPAY_OPEN: SubPaymentStatus[] = [
  SubPaymentStatus.pending,
  SubPaymentStatus.requested,
  SubPaymentStatus.approved,
];
const MH_OPEN: MhOrderStatus[] = [MhOrderStatus.ordered, MhOrderStatus.received];
const SCHEDULE_OPEN: PaymentStatus[] = [
  PaymentStatus.not_collected,
  PaymentStatus.request_sent,
  PaymentStatus.pending,
  PaymentStatus.customer_late,
  PaymentStatus.overdue,
];

// Các sourceType có bản ghi cash_plan_items chia đợt gắn vào nguồn.
const SPLIT_TYPES = new Set(["mh_order", "ncc_congno", "sub_debt", "loan_principal", "advance"]);
// Self-entry: mỗi bản ghi là 1 dòng độc lập.
const SELF_TYPES = new Set(["loan_interest", "salary", "manual"]);

export async function buildCashPlan(opts?: { projectId?: string | null }): Promise<CashPlanData> {
  const projectFilter = opts?.projectId ?? undefined;

  const [
    balAgg,
    planItems,
    subPayments,
    mhOrders,
    loans,
    advances,
    schedules,
    nccDebtRows,
    subContracts,
  ] = await Promise.all([
    // Số dư = Σ thu − Σ chi (mọi giao dịch đã ghi).
    prisma.cashTransaction
      .groupBy({ by: ["direction"], _sum: { amount: true } })
      .then((rows) =>
        rows.reduce((b, r) => b + (r.direction === "in" ? 1 : -1) * num(r._sum.amount), 0),
      ),
    prisma.cashPlanItem.findMany({
      where: { status: { not: CashPlanStatus.cancelled } },
      orderBy: [{ plannedDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.subPayment.findMany({
      // Chỉ đợt của HĐ đang chạy — bỏ HĐ draft/cancelled (đã kết thúc, không còn dự chi).
      where: {
        status: { in: SUBPAY_OPEN },
        subContract: { status: { in: ["active", "completed"] } },
      },
      select: {
        id: true,
        stage: true,
        description: true,
        expectedAmount: true,
        actualAmount: true,
        expectedDate: true,
        subContract: {
          select: {
            projectId: true,
            project: { select: { code: true, name: true } },
            subcontractor: { select: { name: true } },
          },
        },
      },
    }),
    // Chỉ đơn TRẢ NGAY (không gắn NCC công nợ) chưa trả đủ. Công nợ NCC lấy ở nguồn riêng.
    prisma.mhOrder.findMany({
      where: {
        status: { in: MH_OPEN },
        supplierId: null,
        ...(projectFilter ? { projectId: projectFilter } : {}),
      },
      select: {
        id: true,
        seq: true,
        supplierName: true,
        supplierId: true,
        total: true,
        deliveryDate: true,
        status: true,
        projectId: true,
      },
    }),
    prisma.loan.findMany({
      where: { status: LoanStatus.active },
      select: {
        id: true,
        code: true,
        lender: true,
        principal: true,
        interestRate: true,
        dueDate: true,
        expenses: { select: { amount: true, status: true, category: { select: { code: true } } } },
        receipts: { select: { amount: true, status: true } },
      },
    }),
    prisma.advance.findMany({
      where: { status: AdvanceStatus.open },
      select: {
        id: true,
        code: true,
        recipient: true,
        amount: true,
        expenses: { select: { amount: true, status: true } },
        receipts: { select: { amount: true, status: true } },
      },
    }),
    prisma.paymentSchedule.findMany({
      where: { status: { in: SCHEDULE_OPEN }, ...(projectFilter ? { projectId: projectFilter } : {}) },
      select: {
        id: true,
        phaseNumber: true,
        milestoneDescription: true,
        amount: true,
        expectedDate: true,
        dueDate: true,
        projectId: true,
        project: { select: { code: true, name: true } },
      },
    }),
    // Công nợ NCC vật tư còn lại (per dự án + NCC) từ view ncc_cong_no_du_an.
    prisma.$queryRaw<
      { project_id: string; supplier_id: string; supplier_name: string | null; con_lai: number }[]
    >`
      SELECT project_id, supplier_id, supplier_name, con_lai::float8 AS con_lai
      FROM ncc_cong_no_du_an
      WHERE con_lai > 0`,
    // HĐ thầu phụ đang chạy — kèm đếm số đợt để bỏ HĐ đã chia đợt.
    prisma.subContract.findMany({
      where: {
        status: { in: ["active", "completed"] },
        ...(projectFilter ? { projectId: projectFilter } : {}),
      },
      select: {
        id: true,
        contractValue: true,
        projectId: true,
        project: { select: { code: true, name: true } },
        subcontractor: { select: { name: true } },
        _count: { select: { payments: true } },
      },
    }),
  ]);

  const balance = balAgg;

  // Cọc đã trả cho đơn mua hàng = Σ paidAmount lệnh chi 'mua_hang_order' đã paid → trừ vào dự chi.
  const mhIds = mhOrders.map((o) => o.id);
  const depositRows = mhIds.length
    ? await prisma.expense.groupBy({
        by: ["sourceId"],
        where: { sourceType: "mua_hang_order", sourceId: { in: mhIds }, status: "paid" },
        _sum: { paidAmount: true },
      })
    : [];
  const depositMap = new Map(depositRows.map((r) => [r.sourceId, num(r._sum.paidAmount)]));

  // Gom chunks theo nguồn + self-entries riêng.
  const chunksBySource = new Map<string, PlanChunk[]>();
  const selfRows: CashRow[] = [];
  for (const it of planItems) {
    const chunk: PlanChunk = {
      id: it.id,
      plannedDate: toDate(it.plannedDate),
      amount: num(it.amount),
      note: it.note,
      title: it.title,
      recurGroupId: it.recurGroupId,
    };
    if (SPLIT_TYPES.has(it.sourceType) && it.sourceId) {
      const k = `${it.sourceType}:${it.sourceId}`;
      (chunksBySource.get(k) ?? chunksBySource.set(k, []).get(k)!).push(chunk);
    } else if (SELF_TYPES.has(it.sourceType)) {
      const isInterest = it.sourceType === "loan_interest";
      selfRows.push({
        key: `item:${it.id}`,
        direction: it.direction === "in" ? "in" : "out",
        sourceType: it.sourceType,
        sourceId: it.sourceId ?? null,
        projectId: it.projectId ?? null,
        projectLabel: null,
        title: it.title ?? (isInterest ? "Lãi vay" : it.sourceType === "salary" ? "Lương" : "Khoản chi tay"),
        subtitle: it.note,
        total: chunk.amount,
        hasTotal: false,
        canSplit: false,
        nativeDate: chunk.plannedDate,
        nativeEditable: false,
        chunks: [],
        planned: chunk.plannedDate ? chunk.amount : 0,
        unplanned: chunk.plannedDate ? 0 : chunk.amount,
        selfItemId: it.id,
      });
    }
  }

  const getChunks = (type: string, id: string) => chunksBySource.get(`${type}:${id}`) ?? [];
  const projLabel = (p: { code: string; name: string } | null | undefined) =>
    p ? `${p.code} · ${p.name}` : null;
  // MhOrder chỉ có projectId scalar (không relation) → map nhãn dự án riêng.
  const projectList = await prisma.project.findMany({ select: { id: true, code: true, name: true } });
  const projectMap = new Map(projectList.map((p) => [p.id, p]));

  // Dựng 1 khoản source-backed (có tổng + chia đợt).
  function sourceRow(args: {
    key: string;
    direction: CashDir;
    sourceType: string;
    sourceId: string;
    projectId: string | null;
    projectLabel: string | null;
    title: string;
    subtitle: string | null;
    total: number;
    nativeDate: string | null;
    nativeEditable: boolean;
    canSplit: boolean;
  }): CashRow {
    const chunks = args.canSplit ? getChunks(args.sourceType, args.sourceId) : [];
    const chunkSum = chunks.reduce((s, c) => s + c.amount, 0);
    const remaining = Math.max(0, args.total - chunkSum);
    const nativeHolds = !!args.nativeDate && remaining > EPS;
    const planned = chunkSum + (nativeHolds ? remaining : 0);
    const unplanned = args.nativeDate ? 0 : remaining;
    return {
      ...args,
      hasTotal: true,
      chunks,
      planned,
      unplanned,
      selfItemId: null,
    };
  }

  const out: CashRow[] = [];
  const inn: CashRow[] = [];

  // ── CHI ──────────────────────────────────────────────────────────────────
  // 1) Thầu phụ đợt (native, không chia).
  for (const sp of subPayments) {
    if (projectFilter && sp.subContract.projectId !== projectFilter) continue;
    out.push(
      sourceRow({
        key: `sub_payment:${sp.id}`,
        direction: "out",
        sourceType: "sub_payment",
        sourceId: sp.id,
        projectId: sp.subContract.projectId,
        projectLabel: projLabel(sp.subContract.project),
        title: `Thầu phụ · ${sp.subContract.subcontractor.name}`,
        subtitle: `Đợt ${sp.stage} · ${sp.description}`,
        // Còn phải trả = đợt (expected) − đã trả cộng dồn (actualAmount, tạm ứng).
        // Đợt trả đủ → status 'paid' (không nằm SUBPAY_OPEN) nên còn lại luôn > 0.
        total: Math.max(0, num(sp.expectedAmount) - num(sp.actualAmount)),
        nativeDate: toDate(sp.expectedDate),
        nativeEditable: true,
        canSplit: false,
      }),
    );
  }

  // 2) Mua hàng chưa trả (native deliveryDate + chia đợt cho công nợ). Trừ cọc đã trả.
  for (const o of mhOrders) {
    const deposit = depositMap.get(o.id) ?? 0;
    const owed = Math.max(0, num(o.total) - deposit);
    if (owed <= EPS) continue; // đã trả đủ (cọc phủ hết) → không còn dự chi
    out.push(
      sourceRow({
        key: `mh_order:${o.id}`,
        direction: "out",
        sourceType: "mh_order",
        sourceId: o.id,
        projectId: o.projectId,
        projectLabel: projLabel(projectMap.get(o.projectId) ?? null),
        title: `Mua hàng · Đơn #${o.seq}${o.supplierName ? ` · ${o.supplierName}` : ""}`,
        subtitle:
          (o.supplierId ? "Công nợ NCC" : "Trả ngay") + (deposit > EPS ? " · đã cọc" : ""),
        total: owed,
        nativeDate: toDate(o.deliveryDate),
        nativeEditable: true,
        canSplit: true,
      }),
    );
  }

  // 3) Nợ gốc vay (không native, chia đợt).
  for (const l of loans) {
    const s = summarizeLoan(l);
    if (s.outstanding > EPS) {
      out.push(
        sourceRow({
          key: `loan_principal:${l.id}`,
          direction: "out",
          sourceType: "loan_principal",
          sourceId: l.id,
          projectId: null,
          projectLabel: null,
          title: `Trả nợ gốc · ${l.lender}`,
          subtitle: l.code,
          total: s.outstanding,
          nativeDate: null,
          nativeEditable: false,
          canSplit: true,
        }),
      );
    }
  }

  // 4) Công nợ NCC vật tư còn lại (per NCC, chia đợt; không có ngày gốc).
  for (const r of nccDebtRows) {
    if (projectFilter && r.project_id !== projectFilter) continue;
    const owed = num(r.con_lai);
    if (owed <= EPS) continue;
    out.push(
      sourceRow({
        key: `ncc_congno:${r.project_id}:${r.supplier_id}`,
        direction: "out",
        sourceType: "ncc_congno",
        sourceId: r.supplier_id,
        projectId: r.project_id,
        projectLabel: projLabel(projectMap.get(r.project_id) ?? null),
        title: `Công nợ NCC · ${r.supplier_name ?? "NCC"}`,
        subtitle: "Vật tư đã nhận, chưa trả",
        total: owed,
        nativeDate: null,
        nativeEditable: false,
        canSplit: true,
      }),
    );
  }

  // 5) Nợ thầu phụ — chỉ HĐ CHƯA chia đợt (contractValue; chia đợt trong kế hoạch).
  for (const sc of subContracts) {
    if (sc._count.payments > 0) continue; // đã có đợt → dùng nguồn "Thầu phụ đợt"
    const owed = num(sc.contractValue);
    if (owed <= EPS) continue;
    out.push(
      sourceRow({
        key: `sub_debt:${sc.id}`,
        direction: "out",
        sourceType: "sub_debt",
        sourceId: sc.id,
        projectId: sc.projectId,
        projectLabel: projLabel(sc.project),
        title: `Nợ thầu phụ · ${sc.subcontractor.name}`,
        subtitle: "HĐ chưa chia đợt",
        total: owed,
        nativeDate: null,
        nativeEditable: false,
        canSplit: true,
      }),
    );
  }

  // ── THU ──────────────────────────────────────────────────────────────────
  // 1) Đợt thu HĐ (native).
  for (const ps of schedules) {
    inn.push(
      sourceRow({
        key: `payment_schedule:${ps.id}`,
        direction: "in",
        sourceType: "payment_schedule",
        sourceId: ps.id,
        projectId: ps.projectId,
        projectLabel: projLabel(ps.project),
        title: `Thu HĐ · Đợt ${ps.phaseNumber}`,
        subtitle: ps.milestoneDescription,
        total: num(ps.amount),
        nativeDate: toDate(ps.expectedDate ?? ps.dueDate),
        nativeEditable: true,
        canSplit: false,
      }),
    );
  }

  // 2) Tạm ứng — dư ứng chưa hoàn = dự THU.
  for (const a of advances) {
    const s = summarizeAdvance(a);
    if (s.outstanding > EPS) {
      inn.push(
        sourceRow({
          key: `advance:${a.id}`,
          direction: "in",
          sourceType: "advance",
          sourceId: a.id,
          projectId: null,
          projectLabel: null,
          title: `Hoàn ứng · ${a.recipient}`,
          subtitle: a.code,
          total: s.outstanding,
          nativeDate: null,
          nativeEditable: false,
          canSplit: true,
        }),
      );
    }
  }

  // Self-entries (lãi vay / lương / nhập tay) → về đúng cột.
  for (const r of selfRows) (r.direction === "in" ? inn : out).push(r);

  return { balance, out, in: inn };
}
