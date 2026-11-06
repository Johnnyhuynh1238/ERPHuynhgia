import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { pctChange, validUntilFrom } from "@/lib/supplier-price";

export const runtime = "nodejs";

// SOP-26 3.8: duyệt / từ chối giá NCC đang chờ. Trên ERP chỉ admin (sếp) bấm — sếp duyệt được mọi cấp.
// Cấp TP Mua hàng / CEO là nhân viên AI, duyệt qua máy văn phòng (không đăng nhập ERP).
const schema = z.object({
  action: z.enum(["duyet", "tu_choi"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string; priceId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== UserRole.admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  const price = await prisma.supplierMaterialPrice.findFirst({
    where: { id: params.priceId, supplierId: params.id },
    select: {
      id: true,
      supplierId: true,
      materialName: true,
      unit: true,
      unitPrice: true,
      approvedAt: true,
      pendingPrice: true,
      pendingRank: true,
      pendingLevel: true,
    },
  });
  if (!price) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!price.pendingLevel || price.pendingPrice === null) {
    return NextResponse.json({ error: "not_pending", message: "Giá này không có đề xuất chờ duyệt" }, { status: 409 });
  }

  const now = new Date();
  const actor = user.name ?? user.email ?? "admin";
  const oldPrice = price.approvedAt ? Number(price.unitPrice) : null;
  const pct = pctChange(oldPrice, Number(price.pendingPrice));
  const clear = { pendingPrice: null, pendingRank: null, pendingLevel: null, pendingAt: null, pendingBy: null };

  await prisma.$transaction(async (tx) => {
    if (parsed.data.action === "duyet") {
      await tx.supplierMaterialPrice.update({
        where: { id: price.id },
        data: {
          unitPrice: price.pendingPrice!,
          supplierRank: price.pendingRank,
          approvedAt: now,
          approvedBy: actor,
          validUntil: validUntilFrom(now),
          ...clear,
        },
      });
    } else {
      await tx.supplierMaterialPrice.update({ where: { id: price.id }, data: clear });
    }
    await tx.supplierPriceLog.create({
      data: {
        priceId: price.id,
        supplierId: price.supplierId,
        materialName: price.materialName,
        unit: price.unit,
        action: parsed.data.action,
        oldPrice: oldPrice === null ? null : new Prisma.Decimal(oldPrice),
        newPrice: price.pendingPrice,
        pct: pct === null ? null : new Prisma.Decimal(pct),
        level: price.pendingLevel,
        rank: price.pendingRank,
        note: parsed.data.note || null,
        actor,
        userId: user.id,
      },
    });
  });
  return NextResponse.json({ ok: true });
}
