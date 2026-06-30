import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const STAFF_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(999).optional(),
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
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const group = await prisma.supplierMaterialGroup.create({
      data: {
        supplierId: supplier.id,
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
      select: { id: true, name: true, sortOrder: true },
    });
    return NextResponse.json({ group }, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "duplicate", message: "Nhóm hàng đã tồn tại" }, { status: 409 });
    }
    throw err;
  }
}
