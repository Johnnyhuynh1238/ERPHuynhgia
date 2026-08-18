import { NextResponse } from "next/server";
import {
  ExpenseStatus,
  MhOrderStatus,
  SubContractStatus,
  SubPaymentStatus,
  UserRole,
} from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function canAccess(role: string | undefined) {
  return role === UserRole.admin || role === UserRole.accountant;
}

const MH_ACTIVE: MhOrderStatus[] = [
  MhOrderStatus.ordered,
  MhOrderStatus.received,
  MhOrderStatus.paid,
];
const num = (d: { toString(): string } | number | null | undefined) => (d == null ? 0 : Number(d));

type Kind = "total" | "spent" | "debt";
type Goods = { name: string; unit: string; qty: number; price: number };
type Item = {
  source: "mh_order" | "sub" | "expense" | "ncc";
  id: string;
  label: string;
  sub: string;
  amount: number;
  date: string | null;
  budgetLineId: string | null;
  goods?: Goods[];
};

const goodsOf = (items: unknown): Goods[] =>
  Array.isArray(items)
    ? (items as { name?: string; unit?: string; qty?: number; price?: number }[]).map((it) => ({
        name: String(it.name ?? ""),
        unit: String(it.unit ?? ""),
        qty: Number(it.qty ?? 0),
        price: Number(it.price ?? 0),
      }))
    : [];

// GET ?kind=total|spent|debt — chi phí của 1 hạng mục (hoặc "unassigned").
//   total = mọi nguồn (giá trị đơn/HĐ) + đổi hạng mục.
//   spent = sổ quỹ đã chi thực tế (phần đã trả).
//   debt  = công nợ còn lại (NCC, thầu phụ, đơn mở).
// Logic spent/debt mirror lib/budget-plan.ts buildBudgetPlan để KHỚP số ở bảng.
export async function GET(
  req: Request,
  { params }: { params: { id: string; lineId: string } },
) {
  const user = await getCurrentUser();
  if (!canAccess(user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const kind = ((new URL(req.url).searchParams.get("kind") as Kind) || "total") as Kind;
  const projectId = params.id;
  const lineFilter = params.lineId === "unassigned" ? null : params.lineId;

  const [orders, subs, expenses, lines] = await Promise.all([
    prisma.mhOrder.findMany({
      where: { projectId, status: { in: MH_ACTIVE }, budgetLineId: lineFilter },
      select: {
        id: true,
        seq: true,
        supplierId: true,
        supplierName: true,
        total: true,
        status: true,
        orderDate: true,
        budgetLineId: true,
        items: true,
      },
      orderBy: { seq: "desc" },
    }),
    prisma.subContract.findMany({
      where: {
        projectId,
        status: { in: [SubContractStatus.active, SubContractStatus.completed] },
        budgetLineId: lineFilter,
      },
      select: {
        id: true,
        code: true,
        title: true,
        contractValue: true,
        status: true,
        budgetLineId: true,
        payments: { select: { status: true, actualAmount: true } },
      },
    }),
    prisma.expense.findMany({
      where: {
        projectId,
        status: ExpenseStatus.paid,
        sourceType: { notIn: ["mua_hang_order", "ncc_congno"] },
        budgetLineId: lineFilter,
      },
      select: {
        id: true,
        amount: true,
        paidAmount: true,
        note: true,
        paidAt: true,
        createdAt: true,
        budgetLineId: true,
        category: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.projectBudgetPlanLine.findMany({
      where: { plan: { projectId } },
      select: { id: true, name: true, groupKind: true },
      orderBy: { sortRank: "asc" },
    }),
  ]);

  const dstr = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

  // ── TOTAL: mọi nguồn ở giá trị đơn/HĐ (như cũ, giữ để đổi hạng mục) ──
  if (kind === "total") {
    const items: Item[] = [
      ...orders.map((o) => ({
        source: "mh_order" as const,
        id: o.id,
        label: `Đơn #${o.seq}${o.supplierName ? ` · ${o.supplierName}` : ""}`,
        sub: o.status === "paid" ? "Đã thanh toán" : o.supplierName ? "Công nợ NCC" : "Trả ngay",
        amount: num(o.total),
        date: dstr(o.orderDate),
        budgetLineId: o.budgetLineId,
        goods: goodsOf(o.items),
      })),
      ...subs.map((s) => ({
        source: "sub" as const,
        id: s.id,
        label: `${s.code} · ${s.title}`,
        sub: s.status === SubContractStatus.completed ? "Thầu phụ · hoàn thành" : "Thầu phụ · đang làm",
        amount: num(s.contractValue),
        date: null,
        budgetLineId: s.budgetLineId,
      })),
      ...expenses.map((e) => ({
        source: "expense" as const,
        id: e.id,
        label: e.note?.trim() || e.category?.name || "Chi phí",
        sub: "Chi tay",
        amount: num(e.paidAmount ?? e.amount),
        date: dstr(e.paidAt ?? e.createdAt),
        budgetLineId: e.budgetLineId,
      })),
    ];
    return NextResponse.json({ items, lines });
  }

  // ── SPENT / DEBT: tách đã-trả / còn-nợ từng nguồn ──
  // Đơn NCC đã 'paid' (trả ngay/tất toán riêng) nằm ngoài công nợ NCC — xử lý
  // như đơn trả ngay (đã chi = total, nợ 0). Khớp lib/budget-plan.ts.
  const cashOrders = orders.filter((o) => !o.supplierId || o.status === MhOrderStatus.paid);
  const nccOrders = orders.filter((o) => o.supplierId && o.status !== MhOrderStatus.paid); // công nợ NCC

  // Đã trả cho đơn TRẢ NGAY (cọc/paid) — expense mua_hang_order paid.
  const cashIds = cashOrders.map((o) => o.id);
  const depositRows = cashIds.length
    ? await prisma.expense.groupBy({
        by: ["sourceId"],
        where: { sourceType: "mua_hang_order", sourceId: { in: cashIds }, status: ExpenseStatus.paid },
        _sum: { paidAmount: true },
      })
    : [];
  const depositMap = new Map(depositRows.map((r) => [r.sourceId, num(r._sum.paidAmount)]));

  // Công nợ NCC: phân bổ da_tra/con_lai (toàn dự án) theo tỉ trọng đơn của hạng mục.
  const supplierIds = Array.from(new Set(nccOrders.map((o) => o.supplierId!)));
  const allBySupplier = new Map<string, number>();
  const nameBySupplier = new Map<string, string>();
  const viewMap = new Map<string, { da_tra: number; con_lai: number }>();
  if (supplierIds.length) {
    const allOrders = await prisma.mhOrder.findMany({
      where: {
        projectId,
        // Loại đơn 'paid' khỏi mẫu số phân bổ công nợ (khớp view + lib/budget-plan.ts).
        status: { in: [MhOrderStatus.ordered, MhOrderStatus.received] },
        supplierId: { in: supplierIds },
      },
      select: { supplierId: true, supplierName: true, total: true },
    });
    for (const o of allOrders) {
      allBySupplier.set(o.supplierId!, (allBySupplier.get(o.supplierId!) ?? 0) + num(o.total));
      if (o.supplierName) nameBySupplier.set(o.supplierId!, o.supplierName);
    }
    const rows = await prisma.$queryRaw<
      { supplier_id: string; da_tra: number; con_lai: number }[]
    >`SELECT supplier_id, da_tra::float8 AS da_tra, con_lai::float8 AS con_lai
      FROM ncc_cong_no_du_an WHERE project_id = ${projectId}::uuid`;
    for (const r of rows) viewMap.set(r.supplier_id, { da_tra: r.da_tra, con_lai: r.con_lai });
  }
  const lineBySupplier = new Map<string, number>();
  for (const o of nccOrders)
    lineBySupplier.set(o.supplierId!, (lineBySupplier.get(o.supplierId!) ?? 0) + num(o.total));

  const items: Item[] = [];

  if (kind === "spent") {
    for (const o of cashOrders) {
      const total = num(o.total);
      const paid = o.status === MhOrderStatus.paid ? total : Math.min(total, depositMap.get(o.id) ?? 0);
      if (paid > 0.5)
        items.push({
          source: "mh_order",
          id: o.id,
          label: `Đơn #${o.seq}`,
          sub: o.supplierName ? "Đã trả · đơn NCC" : "Đã trả · trả ngay",
          amount: paid,
          date: dstr(o.orderDate),
          budgetLineId: o.budgetLineId,
          goods: goodsOf(o.items),
        });
    }
    for (const sid of supplierIds) {
      const all = allBySupplier.get(sid) ?? 0;
      if (all <= 0) continue;
      const ratio = (lineBySupplier.get(sid) ?? 0) / all;
      const paid = (viewMap.get(sid)?.da_tra ?? 0) * ratio;
      if (paid > 0.5)
        items.push({
          source: "ncc",
          id: sid,
          label: `NCC · ${nameBySupplier.get(sid) ?? ""}`,
          sub: "Đã trả · công nợ NCC",
          amount: paid,
          date: null,
          budgetLineId: null,
        });
    }
    for (const s of subs) {
      const paid = s.payments.reduce(
        (a, p) => (p.status === SubPaymentStatus.cancelled ? a : a + num(p.actualAmount)),
        0,
      );
      if (paid > 0.5)
        items.push({
          source: "sub",
          id: s.id,
          label: `${s.code} · ${s.title}`,
          sub: "Thầu phụ · đã chi",
          amount: paid,
          date: null,
          budgetLineId: s.budgetLineId,
        });
    }
    for (const e of expenses)
      items.push({
        source: "expense",
        id: e.id,
        label: e.note?.trim() || e.category?.name || "Chi phí",
        sub: "Chi tay",
        amount: num(e.paidAmount ?? e.amount),
        date: dstr(e.paidAt ?? e.createdAt),
        budgetLineId: e.budgetLineId,
      });
  } else {
    // debt
    for (const o of cashOrders) {
      const total = num(o.total);
      const paid = o.status === MhOrderStatus.paid ? total : Math.min(total, depositMap.get(o.id) ?? 0);
      const owed = total - paid;
      if (owed > 0.5)
        items.push({
          source: "mh_order",
          id: o.id,
          label: `Đơn #${o.seq}`,
          sub: "Còn nợ · trả ngay",
          amount: owed,
          date: dstr(o.orderDate),
          budgetLineId: o.budgetLineId,
          goods: goodsOf(o.items),
        });
    }
    for (const sid of supplierIds) {
      const all = allBySupplier.get(sid) ?? 0;
      if (all <= 0) continue;
      const lineTotal = lineBySupplier.get(sid) ?? 0;
      const v = viewMap.get(sid);
      // NCC chưa vào view → coi toàn bộ đơn hạng mục là còn nợ.
      const owed = v ? v.con_lai * (lineTotal / all) : lineTotal;
      if (owed > 0.5)
        items.push({
          source: "ncc",
          id: sid,
          label: `NCC · ${nameBySupplier.get(sid) ?? ""}`,
          sub: "Còn nợ NCC",
          amount: owed,
          date: null,
          budgetLineId: null,
        });
    }
    for (const s of subs) {
      const cv = num(s.contractValue);
      const paid = s.payments.reduce(
        (a, p) => (p.status === SubPaymentStatus.cancelled ? a : a + num(p.actualAmount)),
        0,
      );
      const owed = Math.max(0, cv - paid);
      if (owed > 0.5)
        items.push({
          source: "sub",
          id: s.id,
          label: `${s.code} · ${s.title}`,
          sub: "Thầu phụ · còn nợ",
          amount: owed,
          date: null,
          budgetLineId: s.budgetLineId,
        });
    }
  }

  items.sort((a, b) => b.amount - a.amount);
  return NextResponse.json({ items, lines });
}
