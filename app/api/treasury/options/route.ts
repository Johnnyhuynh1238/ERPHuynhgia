import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const [projects, categories, designContractsRaw] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ status: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    prisma.expenseCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, scope: true },
    }),
    prisma.designContract.findMany({
      orderBy: [{ status: "asc" }, { signedAt: "desc" }],
      select: { id: true, customerName: true, signedAt: true },
    }),
  ]);

  const designContracts = designContractsRaw.map((c) => ({
    id: c.id,
    customerName: c.customerName,
    signedAt: c.signedAt.toISOString().slice(0, 10),
  }));

  return NextResponse.json({ projects, categories, designContracts });
}
