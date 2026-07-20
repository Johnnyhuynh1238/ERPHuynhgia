import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMuaHang } from "@/lib/estimate";
import { recordCashTxn } from "@/lib/treasury";

export const runtime = "nodejs";

type OrderItem = { key: string; name: string; unit: string; qty: number; price: number };

// GET: công nợ NCC của dự án.
//  - Nợ  = Σ đơn mh_orders status='received' + có supplier_id (đã ghi công nợ).
//  - Trả = Σ ncc_thanh_toan (theo project + supplier).
//  - Gộp theo NCC: mỗi NCC kèm danh sách đơn (cũ→mới) + lịch sử thanh toán.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireMuaHang();
  if (error) return error;

  const orders = await prisma.mhOrder.findMany({
    where: { projectId: params.id, status: "received", supplierId: { not: null } },
    orderBy: [{ orderDate: "asc" }, { seq: "asc" }],
  });

  const supplierIds = Array.from(new Set(orders.map((o) => o.supplierId!).filter(Boolean)));

  const [suppliers, payRows, accounts] = await Promise.all([
    supplierIds.length
      ? prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true, phone: true, bankName: true, bankAccount: true },
        })
      : Promise.resolve([]),
    supplierIds.length
      ? prisma.$queryRaw<
          Array<{ id: string; supplier_id: string; so_tien: string; ngay: Date; ghi_chu: string | null }>
        >`
          SELECT id, supplier_id, so_tien, ngay, ghi_chu
          FROM ncc_thanh_toan
          WHERE project_id = ${params.id}::uuid
          ORDER BY ngay ASC`
      : Promise.resolve([]),
    prisma.cashAccount.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true, kind: true, currentBalance: true },
    }),
  ]);

  const supMap = new Map(suppliers.map((s) => [s.id, s]));

  // NCC nào đã có lệnh chi đang chờ (KT gửi/ chờ admin duyệt) -> khoá nút "Gửi lệnh chi".
  // Lệnh bị từ chối/huỷ = cancelled nên không khoá (cho gửi lại).
  const inflight = supplierIds.length
    ? await prisma.expense.findMany({
        where: {
          sourceType: "ncc_congno",
          sourceId: { in: supplierIds },
          status: { in: ["tptc_pending", "pending"] },
        },
        select: { sourceId: true },
      })
    : [];
  const inflightSet = new Set(inflight.map((e) => e.sourceId));

  // gộp
  const groups = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      phone: string | null;
      bankName: string | null;
      bankAccount: string | null;
      tongNo: number;
      daTra: number;
      orders: unknown[];
      payments: { id: string; soTien: number; ngay: Date; ghiChu: string | null }[];
    }
  >();

  for (const o of orders) {
    const sid = o.supplierId!;
    if (!groups.has(sid)) {
      const s = supMap.get(sid);
      groups.set(sid, {
        supplierId: sid,
        supplierName: s?.name || o.supplierName || "NCC",
        phone: s?.phone ?? null,
        bankName: s?.bankName ?? null,
        bankAccount: s?.bankAccount ?? null,
        tongNo: 0,
        daTra: 0,
        orders: [],
        payments: [],
      });
    }
    const g = groups.get(sid)!;
    g.tongNo += Number(o.total);
    g.orders.push({
      id: o.id,
      seq: o.seq,
      status: o.status,
      supplierId: o.supplierId,
      supplierName: o.supplierName,
      orderDate: o.orderDate,
      deliveryDate: o.deliveryDate,
      note: o.note,
      total: Number(o.total),
      items: o.items as unknown as OrderItem[],
    });
  }

  for (const p of payRows) {
    const g = groups.get(p.supplier_id);
    if (!g) continue;
    const amt = Number(p.so_tien);
    g.daTra += amt;
    g.payments.push({ id: p.id, soTien: amt, ngay: p.ngay, ghiChu: p.ghi_chu });
  }

  const list = Array.from(groups.values())
    .map((g) => ({
      ...g,
      conLai: Math.max(g.tongNo - g.daTra, 0),
      orderCount: g.orders.length,
      hasInflightExpense: inflightSet.has(g.supplierId),
    }))
    .sort((a, b) => b.conLai - a.conLai || b.tongNo - a.tongNo);

  const summary = list.reduce(
    (s, g) => ({ tongNo: s.tongNo + g.tongNo, daTra: s.daTra + g.daTra, conLai: s.conLai + g.conLai }),
    { tongNo: 0, daTra: 0, conLai: 0 },
  );

  return NextResponse.json({
    summary,
    suppliers: list,
    accounts: accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      kind: a.kind,
      currentBalance: Number(a.currentBalance),
    })),
  });
}

// POST: ghi 1 lần thanh toán GỘP cho 1 NCC.
//  → tạo ncc_thanh_toan + phiếu chi cash_transactions (out) trong 1 transaction.
// Body { supplierId, amount, accountId, date?(YYYY-MM-DD), note? }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireMuaHang();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    supplierId?: string;
    amount?: number;
    accountId?: string;
    date?: string;
    note?: string;
  };

  const amount = Math.round(Number(body.amount) || 0);
  if (!body.supplierId || !body.accountId || !(amount > 0)) {
    return NextResponse.json({ message: "Thiếu NCC / tài khoản / số tiền hợp lệ" }, { status: 400 });
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: body.supplierId },
    select: { id: true, name: true },
  });
  if (!supplier) return NextResponse.json({ message: "Không thấy NCC" }, { status: 404 });

  const when = body.date ? new Date(body.date) : new Date();
  if (isNaN(when.getTime())) return NextResponse.json({ message: "Ngày không hợp lệ" }, { status: 400 });

  const note = `Trả công nợ NCC ${supplier.name}${body.note?.trim() ? ` — ${body.note.trim()}` : ""}`;

  try {
    await prisma.$transaction(async (tx) => {
      await recordCashTxn(tx, {
        direction: "out",
        amount: new Prisma.Decimal(amount),
        occurredAt: when,
        refType: "material_proposal",
        refId: null,
        accountId: body.accountId!,
        projectId: params.id,
        categoryId: null,
        note,
        createdBy: user!.id,
      });
      await tx.$executeRaw`
        INSERT INTO ncc_thanh_toan (supplier_id, so_tien, ngay, ghi_chu, created_by, project_id)
        VALUES (${supplier.id}::uuid, ${amount}, ${when}, ${body.note?.trim() || null}, ${user!.id}::uuid, ${params.id}::uuid)`;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi ghi thanh toán";
    return NextResponse.json({ message: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
