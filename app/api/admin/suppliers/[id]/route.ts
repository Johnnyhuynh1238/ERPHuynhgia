import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const STAFF_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

const patchSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  altPhone: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().max(255).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  taxCode: z.string().trim().max(50).nullable().optional(),
  bankName: z.string().trim().max(100).nullable().optional(),
  bankAccount: z.string().trim().max(50).nullable().optional(),
  bankAccountName: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supplier = await prisma.supplier.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      altPhone: true,
      email: true,
      address: true,
      taxCode: true,
      bankName: true,
      bankAccount: true,
      bankAccountName: true,
      notes: true,
      isActive: true,
      createdAt: true,
      groups: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          sortOrder: true,
          _count: { select: { prices: true } },
        },
      },
      prices: {
        orderBy: [{ groupId: "asc" }, { materialName: "asc" }],
        select: {
          id: true,
          groupId: true,
          materialName: true,
          unit: true,
          supplierItemCode: true,
          unitPrice: true,
          note: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!supplier) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    supplier: {
      ...supplier,
      prices: supplier.prices.map((p) => ({
        ...p,
        unitPrice: Number(p.unitPrice),
      })),
    },
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) data[k] = v === "" ? null : v;
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ ok: true });
  }

  try {
    await prisma.supplier.update({ where: { id: params.id }, data });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
