import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

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

  const price = await prisma.supplierMaterialPrice.upsert({
    where: {
      supplierId_materialName_unit: {
        supplierId: supplier.id,
        materialName: parsed.data.materialName,
        unit: parsed.data.unit,
      },
    },
    create: {
      supplierId: supplier.id,
      materialName: parsed.data.materialName,
      unit: parsed.data.unit,
      supplierItemCode: parsed.data.supplierItemCode || null,
      unitPrice: new Prisma.Decimal(parsed.data.unitPrice),
      groupId: parsed.data.groupId ?? null,
      note: parsed.data.note || null,
      updatedBy: user.id,
    },
    update: {
      supplierItemCode: parsed.data.supplierItemCode || null,
      unitPrice: new Prisma.Decimal(parsed.data.unitPrice),
      groupId: parsed.data.groupId ?? null,
      note: parsed.data.note || null,
      updatedBy: user.id,
    },
    select: { id: true, materialName: true, unit: true, unitPrice: true },
  });
  return NextResponse.json({
    price: { ...price, unitPrice: Number(price.unitPrice) },
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
