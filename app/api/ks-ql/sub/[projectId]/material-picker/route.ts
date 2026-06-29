import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { aggregateConsumption } from "@/app/projects/[id]/budget/totals/_lib/aggregate";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "project_not_accessible" }, { status: 403 });
  }

  const budget = await prisma.projectBudget.findUnique({
    where: { projectId: project.id },
    select: { id: true },
  });
  if (!budget) return NextResponse.json({ items: [] });

  const items = await prisma.projectBudgetItem.findMany({
    where: { budgetId: budget.id },
    select: {
      id: true,
      name: true,
      stage: true,
      quantity: true,
      normCode: true,
      component: { select: { name: true, sortOrder: true } },
    },
    orderBy: [{ stage: "asc" }, { sortRank: "asc" }],
  });

  const normCodes = Array.from(
    new Set(items.map((it) => it.normCode).filter((c): c is string => !!c)),
  );

  const [norms, materialPrices, laborPrices, machinePrices] = await Promise.all([
    normCodes.length
      ? prisma.norm.findMany({
          where: { code: { in: normCodes } },
          select: {
            code: true,
            name: true,
            unit: true,
            materialItems: true,
            laborItems: true,
            machineItems: true,
            kMaterial: true,
            kLabor: true,
            kMachine: true,
          },
        })
      : Promise.resolve([]),
    prisma.materialPrice.findMany({ where: { retiredAt: null }, select: { name: true, unit: true, price: true } }),
    prisma.laborPrice.findMany({ where: { retiredAt: null }, select: { grade: true, price: true } }),
    prisma.machinePrice.findMany({ where: { retiredAt: null }, select: { name: true, price: true } }),
  ]);

  const aggregated = aggregateConsumption({
    budgetItems: items.map((it) => ({
      id: it.id,
      name: it.name,
      stage: it.stage,
      quantity: it.quantity,
      normCode: it.normCode,
      component: it.component,
    })),
    normsByCode: new Map(norms.map((n) => [n.code, n])),
    priceMaterials: new Map(materialPrices.map((p) => [`${p.name}__${p.unit}`, Number(p.price)])),
    priceLabor: new Map(laborPrices.map((p) => [p.grade, Number(p.price)])),
    priceMachines: new Map(machinePrices.map((p) => [p.name, Number(p.price)])),
  });

  return NextResponse.json({
    items: aggregated.materials.map((m) => ({ name: m.name, unit: m.unit, budgetQty: m.total })),
  });
}
