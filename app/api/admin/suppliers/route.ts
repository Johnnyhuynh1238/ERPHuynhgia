import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { generateNextSupplierCode } from "@/lib/supplier";

export const runtime = "nodejs";

const STAFF_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

const createSchema = z.object({
  name: z.string().trim().min(2).max(255),
  phone: z.string().trim().max(50).optional(),
  altPhone: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("").transform(() => undefined)),
  address: z.string().trim().max(500).optional(),
  taxCode: z.string().trim().max(50).optional(),
  bankName: z.string().trim().max(100).optional(),
  bankAccount: z.string().trim().max(50).optional(),
  bankAccountName: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const includeInactive = searchParams.get("includeInactive") === "1";

  const suppliers = await prisma.supplier.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { code: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 100,
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      address: true,
      isActive: true,
      _count: { select: { groups: true, prices: true } },
    },
  });

  return NextResponse.json({ suppliers });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  const code = await generateNextSupplierCode();
  const supplier = await prisma.supplier.create({
    data: {
      code,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      altPhone: parsed.data.altPhone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      taxCode: parsed.data.taxCode || null,
      bankName: parsed.data.bankName || null,
      bankAccount: parsed.data.bankAccount || null,
      bankAccountName: parsed.data.bankAccountName || null,
      notes: parsed.data.notes || null,
      createdBy: user.id,
    },
    select: { id: true, code: true, name: true },
  });

  return NextResponse.json({ supplier }, { status: 201 });
}
