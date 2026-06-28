import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canViewBudget } from "@/lib/project-budget";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const [materials, labor, machines] = await Promise.all([
    prisma.materialPrice.findMany({
      where: { retiredAt: null },
      orderBy: [{ name: "asc" }, { unit: "asc" }],
    }),
    prisma.laborPrice.findMany({
      where: { retiredAt: null },
      orderBy: { grade: "asc" },
    }),
    prisma.machinePrice.findMany({
      where: { retiredAt: null },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    materials: materials.map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit,
      price: Number(m.price),
      source: m.source,
      note: m.note,
    })),
    labor: labor.map((l) => ({
      id: l.id,
      grade: l.grade,
      price: Number(l.price),
      source: l.source,
      note: l.note,
    })),
    machines: machines.map((mm) => ({
      id: mm.id,
      name: mm.name,
      price: Number(mm.price),
      source: mm.source,
      note: mm.note,
    })),
  });
}
