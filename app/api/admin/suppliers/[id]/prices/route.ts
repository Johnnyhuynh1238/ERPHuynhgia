import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isExpired, pctChange, priceLevel } from "@/lib/supplier-price";

export const runtime = "nodejs";

const STAFF_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

// Upsert (supplierId + materialName + unit). Cho phép sửa giá/code/group.
const upsertSchema = z.object({
  materialName: z.string().trim().min(1).max(255),
  unit: z.string().trim().min(1).max(50),
  supplierItemCode: z.string().trim().max(100).optional(),
  unitPrice: z.coerce.number().positive(),
  groupId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).optional(),
  supplierRank: z.enum(["chinh", "du_phong"]).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supplier = await prisma.supplier.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!supplier) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.groupId) {
    const g = await prisma.supplierMaterialGroup.findFirst({
      where: { id: parsed.data.groupId, supplierId: supplier.id },
      select: { id: true },
    });
    if (!g) return NextResponse.json({ error: "invalid_group" }, { status: 400 });
  }

  // SOP-26 3.8: giá mới KHÔNG thay giá đang dùng ngay — vào pending_* chờ đúng cấp duyệt.
  const newPrice = parsed.data.unitPrice;
  const key = {
    supplierId: supplier.id,
    materialName: parsed.data.materialName,
    unit: parsed.data.unit,
  };
  const existing = await prisma.supplierMaterialPrice.findUnique({
    where: { supplierId_materialName_unit: key },
    select: {
      id: true,
      unitPrice: true,
      supplierRank: true,
      approvedAt: true,
      validUntil: true,
      pendingPrice: true,
      pendingRank: true,
      pendingLevel: true,
    },
  });

  // Không gửi supplierRank → giữ nguyên hạng NCC đang có.
  const newRank =
    parsed.data.supplierRank === undefined ? existing?.supplierRank ?? null : parsed.data.supplierRank;
  const approvedPrice = existing?.approvedAt ? Number(existing.unitPrice) : null;
  const unchanged =
    !!existing &&
    approvedPrice === newPrice &&
    (existing.supplierRank ?? null) === newRank &&
    !isExpired(existing.validUntil);
  const level = priceLevel(approvedPrice, newPrice, newRank === "chinh" && existing?.supplierRank !== "chinh");
  // Chỉ sửa ghi chú/mã/nhóm khi đang có đề xuất y hệt → giữ đề xuất cũ, không ghi lịch sử lại.
  const samePending =
    !!existing?.pendingLevel &&
    existing.pendingPrice !== null &&
    Number(existing.pendingPrice) === newPrice &&
    (existing.pendingRank ?? null) === newRank;
  const pending = samePending
    ? {}
    : unchanged
    ? { pendingPrice: null, pendingRank: null, pendingLevel: null, pendingAt: null, pendingBy: null }
    : {
        pendingPrice: new Prisma.Decimal(newPrice),
        pendingRank: newRank,
        pendingLevel: level,
        pendingAt: new Date(),
        pendingBy: user.id,
      };
  const common = {
    supplierItemCode: parsed.data.supplierItemCode || null,
    groupId: parsed.data.groupId ?? null,
    note: parsed.data.note || null,
    updatedBy: user.id,
  };

  const price = await prisma.$transaction(async (tx) => {
    const p = existing
      ? await tx.supplierMaterialPrice.update({
          where: { id: existing.id },
          data: { ...common, ...pending },
          select: { id: true, materialName: true, unit: true, unitPrice: true },
        })
      : await tx.supplierMaterialPrice.create({
          // VT mới: unit_price bắt buộc có → ghi giá nhập, nhưng approved_at trống = CHƯA duyệt.
          data: { ...key, ...common, ...pending, unitPrice: new Prisma.Decimal(newPrice) },
          select: { id: true, materialName: true, unit: true, unitPrice: true },
        });
    if (!unchanged && !samePending) {
      const pct = pctChange(approvedPrice, newPrice);
      await tx.supplierPriceLog.create({
        data: {
          priceId: p.id,
          supplierId: supplier.id,
          materialName: key.materialName,
          unit: key.unit,
          action: "de_xuat",
          oldPrice: approvedPrice === null ? null : new Prisma.Decimal(approvedPrice),
          newPrice: new Prisma.Decimal(newPrice),
          pct: pct === null ? null : new Prisma.Decimal(pct),
          level,
          rank: newRank,
          actor: user.name ?? user.email ?? null,
          userId: user.id,
        },
      });
    }
    return p;
  });
  return NextResponse.json({
    price: { ...price, unitPrice: Number(price.unitPrice) },
    pendingLevel: samePending ? existing?.pendingLevel ?? null : unchanged ? null : level,
  });
}

// GET: bảng giá hàng hoá của 1 NCC → droplist "hàng theo NCC" ở màn mua hàng.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const prices = await prisma.supplierMaterialPrice.findMany({
    where: { supplierId: params.id },
    orderBy: { materialName: "asc" },
    select: { id: true, materialName: true, unit: true, unitPrice: true, supplierItemCode: true },
  });
  return NextResponse.json({
    prices: prices.map((p) => ({ ...p, unitPrice: Number(p.unitPrice) })),
  });
}
