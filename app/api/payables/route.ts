import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const KT_ROLES = new Set<string>([UserRole.accountant, UserRole.admin]);

// Trả về danh sách công nợ NCC chưa trả + chưa nằm trong lệnh active.
// ?supplierId=... → trả chi tiết từng debt của 1 NCC (để KT tích chọn lập lệnh).
// Không có supplierId → trả nhóm theo NCC (tổng tiền + số món).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!KT_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const supplierId = url.searchParams.get("supplierId");

  // Lấy tất cả debt chưa trả: paidAt null + KHÔNG nằm trong lệnh thanh toán active (pending/approved/paid).
  // (rejected/cancelled lệnh → debt free trở lại.)
  const debts = await prisma.materialProposalItemDebt.findMany({
    where: {
      paidAt: null,
      ...(supplierId ? { supplierId } : {}),
      paymentOrderItems: {
        none: {
          order: {
            status: { in: ["pending", "approved", "paid"] },
          },
        },
      },
    },
    select: {
      id: true,
      proposalId: true,
      itemSeq: true,
      supplierId: true,
      supplierItemCode: true,
      unitPrice: true,
      qty: true,
      totalAmount: true,
      note: true,
      recordedAt: true,
      supplier: { select: { id: true, code: true, name: true, phone: true, bankName: true, bankAccount: true } },
      proposal: {
        select: {
          id: true,
          parsedItems: true,
          project: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: [{ recordedAt: "asc" }],
  });

  if (supplierId) {
    // Detail mode: trả từng món để KT tích chọn.
    const items = debts.map((d) => {
      const parsed = Array.isArray(d.proposal.parsedItems) ? d.proposal.parsedItems : [];
      const it = parsed[d.itemSeq] as { ten?: string; name?: string; dvt?: string; unit?: string } | undefined;
      return {
        debtId: d.id,
        proposalId: d.proposalId,
        itemSeq: d.itemSeq,
        materialName: (it?.name ?? it?.ten ?? "").trim() || "—",
        unit: (it?.unit ?? it?.dvt ?? "").trim(),
        supplierItemCode: d.supplierItemCode,
        unitPrice: Number(d.unitPrice),
        qty: Number(d.qty),
        amount: Number(d.totalAmount),
        note: d.note,
        recordedAt: d.recordedAt.toISOString(),
        project: d.proposal.project,
      };
    });
    const supplier = debts[0]?.supplier ?? null;
    return NextResponse.json({
      mode: "detail",
      supplier,
      items,
      total: items.reduce((s, i) => s + i.amount, 0),
    });
  }

  // Group mode: tổng theo NCC.
  const map = new Map<
    string,
    {
      supplierId: string;
      supplierCode: string;
      supplierName: string;
      phone: string | null;
      bankName: string | null;
      bankAccount: string | null;
      total: number;
      count: number;
      projects: Set<string>;
    }
  >();
  for (const d of debts) {
    const key = d.supplierId;
    let row = map.get(key);
    if (!row) {
      row = {
        supplierId: d.supplier.id,
        supplierCode: d.supplier.code,
        supplierName: d.supplier.name,
        phone: d.supplier.phone,
        bankName: d.supplier.bankName,
        bankAccount: d.supplier.bankAccount,
        total: 0,
        count: 0,
        projects: new Set(),
      };
      map.set(key, row);
    }
    row.total += Number(d.totalAmount);
    row.count += 1;
    row.projects.add(d.proposal.project.code);
  }
  const groups = Array.from(map.values())
    .map((g) => ({
      supplierId: g.supplierId,
      supplierCode: g.supplierCode,
      supplierName: g.supplierName,
      phone: g.phone,
      bankName: g.bankName,
      bankAccount: g.bankAccount,
      total: g.total,
      count: g.count,
      projectCodes: Array.from(g.projects).sort(),
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    mode: "group",
    groups,
    grandTotal: groups.reduce((s, g) => s + g.total, 0),
  });
}
