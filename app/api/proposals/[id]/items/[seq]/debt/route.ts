import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const KT_ROLES = new Set<string>([UserRole.accountant, UserRole.admin]);

type ParsedItem = {
  ten?: string;
  sl?: number;
  dvt?: string;
  name?: string;
  qty?: number;
  unit?: string;
};

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

const upsertSchema = z.object({
  supplierId: z.string().uuid(),
  supplierItemCode: z.string().trim().max(100).nullable().optional(),
  unitPrice: z.coerce.number().positive(),
  qty: z.coerce.number().positive(),
  debtUnit: z.string().trim().max(50).nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  saveToSupplierCatalog: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string; seq: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!KT_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const seq = Number(params.seq);
  if (!Number.isInteger(seq) || seq < 0) {
    return NextResponse.json({ message: "Sai chỉ số" }, { status: 400 });
  }

  const proposal = await prisma.materialProposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      orderStatus: true,
      closedAt: true,
      parsedItems: true,
    },
  });
  if (!proposal) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (proposal.status !== "accepted") {
    return NextResponse.json({ message: "Đề xuất chưa duyệt" }, { status: 400 });
  }
  if (proposal.closedAt) {
    return NextResponse.json({ message: "PO đã đóng — không sửa được" }, { status: 400 });
  }

  const items = (proposal.parsedItems as ParsedItem[] | null) ?? [];
  if (seq >= items.length) {
    return NextResponse.json({ message: "Dòng không tồn tại" }, { status: 400 });
  }
  const item = items[seq];
  const mName = itemName(item);
  const mUnit = itemUnit(item);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON sai" }, { status: 400 });
  }
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu sai", details: parsed.error.flatten() }, { status: 400 });
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: parsed.data.supplierId },
    select: { id: true, isActive: true },
  });
  if (!supplier) return NextResponse.json({ message: "NCC không tồn tại" }, { status: 400 });

  if (parsed.data.groupId) {
    const g = await prisma.supplierMaterialGroup.findFirst({
      where: { id: parsed.data.groupId, supplierId: supplier.id },
      select: { id: true },
    });
    if (!g) return NextResponse.json({ message: "Nhóm hàng không thuộc NCC này" }, { status: 400 });
  }

  const debtUnitClean = parsed.data.debtUnit?.trim() || null;
  const debtUnitFinal = debtUnitClean && debtUnitClean !== mUnit ? debtUnitClean : null;
  const totalAmount = parsed.data.unitPrice * parsed.data.qty;
  const debt = await prisma.materialProposalItemDebt.upsert({
    where: { proposalId_itemSeq: { proposalId: proposal.id, itemSeq: seq } },
    create: {
      proposalId: proposal.id,
      itemSeq: seq,
      supplierId: supplier.id,
      supplierItemCode: parsed.data.supplierItemCode || null,
      unitPrice: new Prisma.Decimal(parsed.data.unitPrice),
      qty: new Prisma.Decimal(parsed.data.qty),
      debtUnit: debtUnitFinal,
      totalAmount: new Prisma.Decimal(totalAmount),
      note: parsed.data.note || null,
      recordedBy: user.id,
    },
    update: {
      supplierId: supplier.id,
      supplierItemCode: parsed.data.supplierItemCode || null,
      unitPrice: new Prisma.Decimal(parsed.data.unitPrice),
      qty: new Prisma.Decimal(parsed.data.qty),
      debtUnit: debtUnitFinal,
      totalAmount: new Prisma.Decimal(totalAmount),
      note: parsed.data.note || null,
      recordedBy: user.id,
      recordedAt: new Date(),
    },
    select: {
      id: true,
      itemSeq: true,
      supplierId: true,
      supplierItemCode: true,
      unitPrice: true,
      qty: true,
      debtUnit: true,
      totalAmount: true,
      note: true,
      recordedAt: true,
    },
  });

  // Cập nhật bảng giá NCC (upsert SupplierMaterialPrice) khi KT tick.
  // Ưu tiên lưu theo unit ghi CN (VD "kg") thay vì unit đề xuất ("Cái").
  const catalogUnit = (debtUnitFinal ?? mUnit).trim();
  if (parsed.data.saveToSupplierCatalog && mName && catalogUnit) {
    await prisma.supplierMaterialPrice.upsert({
      where: {
        supplierId_materialName_unit: {
          supplierId: supplier.id,
          materialName: mName,
          unit: catalogUnit,
        },
      },
      create: {
        supplierId: supplier.id,
        materialName: mName,
        unit: catalogUnit,
        supplierItemCode: parsed.data.supplierItemCode || null,
        unitPrice: new Prisma.Decimal(parsed.data.unitPrice),
        groupId: parsed.data.groupId ?? null,
        updatedBy: user.id,
      },
      update: {
        supplierItemCode: parsed.data.supplierItemCode || null,
        unitPrice: new Prisma.Decimal(parsed.data.unitPrice),
        groupId: parsed.data.groupId ?? null,
        updatedBy: user.id,
      },
    });
  }

  return NextResponse.json({
    debt: {
      ...debt,
      unitPrice: Number(debt.unitPrice),
      qty: Number(debt.qty),
      totalAmount: Number(debt.totalAmount),
    },
    // Cung cấp số đặt + tên + đvt để KT thấy match
    item: { name: mName, unit: mUnit, orderedQty: itemQty(item) },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; seq: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!KT_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const seq = Number(params.seq);
  if (!Number.isInteger(seq) || seq < 0) {
    return NextResponse.json({ message: "Sai chỉ số" }, { status: 400 });
  }
  const proposal = await prisma.materialProposal.findUnique({
    where: { id: params.id },
    select: { closedAt: true },
  });
  if (!proposal) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (proposal.closedAt) {
    return NextResponse.json({ message: "PO đã đóng" }, { status: 400 });
  }
  await prisma.materialProposalItemDebt.deleteMany({
    where: { proposalId: params.id, itemSeq: seq },
  });
  return NextResponse.json({ ok: true });
}
