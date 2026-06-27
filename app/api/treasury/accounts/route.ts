import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const ROLES_VIEW = new Set<string>([UserRole.admin, UserRole.accountant]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ROLES_VIEW.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const accounts = await prisma.cashAccount.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, name: true, kind: true, currentBalance: true },
  });

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      kind: a.kind,
      currentBalance: Number(a.currentBalance),
    })),
  });
}
