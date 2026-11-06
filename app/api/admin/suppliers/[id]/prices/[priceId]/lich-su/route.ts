import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const STAFF_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

// SOP-26 3.8: lịch sử giá 1 vật tư của NCC + giá cùng vật tư ở NCC khác (so giá).
export async function GET(
  _request: Request,
  { params }: { params: { id: string; priceId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const price = await prisma.supplierMaterialPrice.findFirst({
    where: { id: params.priceId, supplierId: params.id },
    select: { id: true, materialName: true, unit: true },
  });
  if (!price) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [logs, peers] = await Promise.all([
    prisma.supplierPriceLog.findMany({
      where: { supplierId: params.id, materialName: price.materialName, unit: price.unit },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        oldPrice: true,
        newPrice: true,
        pct: true,
        level: true,
        rank: true,
        note: true,
        actor: true,
        createdAt: true,
      },
    }),
    prisma.supplierMaterialPrice.findMany({
      where: {
        supplierId: { not: params.id },
        materialName: { equals: price.materialName, mode: "insensitive" },
        unit: { equals: price.unit, mode: "insensitive" },
      },
      orderBy: { unitPrice: "asc" },
      select: {
        id: true,
        unitPrice: true,
        supplierRank: true,
        approvedAt: true,
        validUntil: true,
        pendingPrice: true,
        updatedAt: true,
        supplier: { select: { name: true, isActive: true } },
      },
    }),
  ]);

  const num = (d: { toString(): string } | null) => (d === null ? null : Number(d));
  return NextResponse.json({
    logs: logs.map((l) => ({ ...l, oldPrice: num(l.oldPrice), newPrice: num(l.newPrice), pct: num(l.pct) })),
    peers: peers.map((p) => ({
      id: p.id,
      supplierName: p.supplier.name,
      supplierActive: p.supplier.isActive,
      unitPrice: Number(p.unitPrice),
      pendingPrice: num(p.pendingPrice),
      supplierRank: p.supplierRank,
      approvedAt: p.approvedAt,
      validUntil: p.validUntil,
      updatedAt: p.updatedAt,
    })),
  });
}
