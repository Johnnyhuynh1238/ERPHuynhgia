import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type ParsedItem = {
  ten?: string;
  sl?: number;
  dvt?: string;
  name?: string;
  qty?: number;
  unit?: string;
  task?: string;
};

const STAFF_ROLES = new Set<string>([
  UserRole.admin,
  UserRole.accountant,
  UserRole.construction_manager,
  UserRole.engineer,
]);

function itemName(it: ParsedItem) {
  return (it.name ?? it.ten ?? "").trim();
}
function itemUnit(it: ParsedItem) {
  return (it.unit ?? it.dvt ?? "").trim();
}
function itemQty(it: ParsedItem) {
  if (typeof it.qty === "number") return it.qty;
  if (typeof it.sl === "number") return it.sl;
  return 0;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const supplierIdFilter = url.searchParams.get("supplierId");

  const proposal = await prisma.materialProposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      parsedItems: true,
      closedAt: true,
      orderStatus: true,
      receipts: {
        select: {
          itemSeq: true,
          receivedQty: true,
          qcChecked: true,
          photos: true,
          note: true,
          receivedAt: true,
        },
      },
      debts: {
        select: {
          itemSeq: true,
          supplierId: true,
          supplierItemCode: true,
          unitPrice: true,
          qty: true,
          debtUnit: true,
          totalAmount: true,
          note: true,
          recordedAt: true,
          paidAt: true,
          supplier: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
  if (!proposal) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const rawItems = (proposal.parsedItems as ParsedItem[] | null) ?? [];

  // Lookup suggested prices từ catalog NCC nếu KT đã chọn 1 supplierId cụ thể.
  let supplierPrices: Map<string, { unitPrice: number; supplierItemCode: string | null }> = new Map();
  if (supplierIdFilter) {
    const names = Array.from(new Set(rawItems.map((it) => itemName(it)).filter(Boolean)));
    if (names.length) {
      const prices = await prisma.supplierMaterialPrice.findMany({
        where: { supplierId: supplierIdFilter, materialName: { in: names } },
        select: { materialName: true, unit: true, supplierItemCode: true, unitPrice: true },
      });
      supplierPrices = new Map(
        prices.map((p) => [
          `${p.materialName}__${p.unit}`,
          { unitPrice: Number(p.unitPrice), supplierItemCode: p.supplierItemCode },
        ]),
      );
    }
  }

  const recvBySeq = new Map(proposal.receipts.map((r) => [r.itemSeq, r]));
  const debtBySeq = new Map(proposal.debts.map((d) => [d.itemSeq, d]));

  const items = rawItems.map((it, idx) => {
    const r = recvBySeq.get(idx) ?? null;
    const d = debtBySeq.get(idx) ?? null;
    const name = itemName(it);
    const unit = itemUnit(it);
    const suggested = supplierIdFilter ? supplierPrices.get(`${name}__${unit}`) ?? null : null;
    return {
      seq: idx,
      name,
      unit,
      qty: itemQty(it),
      task: it.task ?? "",
      receipt: r
        ? {
            receivedQty: Number(r.receivedQty),
            qcChecked: r.qcChecked,
            photoCount: ((r.photos as unknown[] | null) ?? []).length,
            note: r.note,
            receivedAt: r.receivedAt.toISOString(),
          }
        : null,
      debt: d
        ? {
            supplierId: d.supplierId,
            supplierCode: d.supplier.code,
            supplierName: d.supplier.name,
            supplierItemCode: d.supplierItemCode,
            unitPrice: Number(d.unitPrice),
            qty: Number(d.qty),
            debtUnit: d.debtUnit,
            totalAmount: Number(d.totalAmount),
            note: d.note,
            recordedAt: d.recordedAt.toISOString(),
            paidAt: d.paidAt?.toISOString() ?? null,
          }
        : null,
      suggestedPrice: suggested,
    };
  });

  return NextResponse.json({
    items,
    closedAt: proposal.closedAt?.toISOString() ?? null,
    orderStatus: proposal.orderStatus,
  });
}
