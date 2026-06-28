import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canViewBudget } from "@/lib/project-budget";

type NormSerialized = {
  code: string;
  name: string;
  unit: string;
  category: string | null;
  materialItems: unknown;
  laborItems: unknown;
  machineItems: unknown;
  kMaterial: number;
  kLabor: number;
  kMachine: number;
  source: string | null;
  note: string | null;
  usageCount: number;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const category = url.searchParams.get("category")?.trim() ?? "";
  const includeUsage = url.searchParams.get("usage") === "1";
  const projectId = url.searchParams.get("projectId") ?? null;

  const where: Prisma.NormWhereInput = {
    retiredAt: null,
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const norms = await prisma.norm.findMany({
    where,
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });

  let usageByCode = new Map<string, number>();
  if (includeUsage) {
    const grouped = await prisma.projectBudgetItem.groupBy({
      by: ["normCode"],
      _count: { _all: true },
      where: {
        normCode: { not: null },
        ...(projectId ? { budget: { projectId } } : {}),
      },
    });
    usageByCode = new Map(grouped.map((g) => [g.normCode as string, g._count._all]));
  }

  const categories = await prisma.norm.findMany({
    where: { retiredAt: null, category: { not: null } },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });

  const data: NormSerialized[] = norms.map((n) => ({
    code: n.code,
    name: n.name,
    unit: n.unit,
    category: n.category,
    materialItems: n.materialItems,
    laborItems: n.laborItems,
    machineItems: n.machineItems,
    kMaterial: Number(n.kMaterial),
    kLabor: Number(n.kLabor),
    kMachine: Number(n.kMachine),
    source: n.source,
    note: n.note,
    usageCount: usageByCode.get(n.code) ?? 0,
  }));

  return NextResponse.json({
    norms: data,
    categories: categories.map((c) => c.category).filter((c): c is string => c != null),
  });
}
