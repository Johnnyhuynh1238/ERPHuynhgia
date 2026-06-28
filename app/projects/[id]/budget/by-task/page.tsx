import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canViewBudget } from "@/lib/project-budget";
import { computeByTask } from "./_lib/by-task";
import { ByTaskClient } from "./_components/by-task-client";

export const metadata = { title: "Giá theo công tác" };

export default async function BudgetByTaskPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (!canViewBudget({ id: user.id, role: user.role })) {
    redirect(`/projects/${params.id}?denied=budget`);
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true },
  });
  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  const budget = await prisma.projectBudget.findUnique({
    where: { projectId: project.id },
    select: { id: true },
  });

  const items = budget
    ? await prisma.projectBudgetItem.findMany({
        where: { budgetId: budget.id },
        select: {
          id: true,
          name: true,
          unit: true,
          stage: true,
          quantity: true,
          normCode: true,
          directUnitPrice: true,
          sortRank: true,
          component: { select: { name: true, sortOrder: true } },
        },
        orderBy: [{ stage: "asc" }, { sortRank: "asc" }],
      })
    : [];

  const normCodes = Array.from(
    new Set(items.map((it) => it.normCode).filter((c): c is string => !!c)),
  );

  const [norms, materialPrices, laborPrices, machinePrices, mePrices] = await Promise.all([
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
    prisma.mePrice.findMany({ where: { retiredAt: null }, select: { name: true, unit: true, price: true } }),
  ]);

  const normsByCode = new Map(norms.map((n) => [n.code, n]));
  const priceMaterials = new Map(materialPrices.map((p) => [`${p.name}__${p.unit}`, Number(p.price)]));
  const priceLabor = new Map(laborPrices.map((p) => [p.grade, Number(p.price)]));
  const priceMachines = new Map(machinePrices.map((p) => [p.name, Number(p.price)]));
  const priceMe = new Map(mePrices.map((p) => [`${p.name.toLowerCase()}__${p.unit.toLowerCase()}`, Number(p.price)]));

  const result = computeByTask({
    budgetItems: items.map((it) => ({
      id: it.id,
      name: it.name,
      unit: it.unit,
      stage: it.stage,
      sortRank: it.sortRank,
      quantity: it.quantity,
      normCode: it.normCode,
      directUnitPrice: it.directUnitPrice,
      component: it.component,
    })),
    normsByCode,
    priceMaterials,
    priceLabor,
    priceMachines,
    priceMe,
  });

  return (
    <ByTaskClient
      projectId={project.id}
      projectName={project.name}
      projectCode={project.code}
      rows={result.rows}
      totals={result.totals}
    />
  );
}
