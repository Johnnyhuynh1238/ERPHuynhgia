import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const STAFF_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; priceId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const price = await prisma.supplierMaterialPrice.findFirst({
    where: { id: params.priceId, supplierId: params.id },
    select: { id: true },
  });
  if (!price) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.supplierMaterialPrice.delete({ where: { id: price.id } });
  return NextResponse.json({ ok: true });
}
