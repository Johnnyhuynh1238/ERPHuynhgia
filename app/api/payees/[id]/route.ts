import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const STAFF_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

// DELETE: xoá đối tượng khỏi danh bạ (có confirm phía client).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.payee.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
