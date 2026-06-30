import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const STAFF_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; groupId: string } },
) {
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
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;
  if (!Object.keys(data).length) return NextResponse.json({ ok: true });

  const group = await prisma.supplierMaterialGroup.findFirst({
    where: { id: params.groupId, supplierId: params.id },
    select: { id: true },
  });
  if (!group) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    await prisma.supplierMaterialGroup.update({ where: { id: group.id }, data });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; groupId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const group = await prisma.supplierMaterialGroup.findFirst({
    where: { id: params.groupId, supplierId: params.id },
    select: { id: true, _count: { select: { prices: true } } },
  });
  if (!group) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (group._count.prices > 0) {
    return NextResponse.json(
      { error: "in_use", message: "Nhóm hàng còn vật tư — xoá vật tư trước" },
      { status: 409 },
    );
  }

  await prisma.supplierMaterialGroup.delete({ where: { id: group.id } });
  return NextResponse.json({ ok: true });
}
