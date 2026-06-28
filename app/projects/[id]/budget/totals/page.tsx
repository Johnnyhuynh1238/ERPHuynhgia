import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canViewBudget } from "@/lib/project-budget";
import { aggregateConsumption } from "./_lib/aggregate";
import { TotalsClient } from "./_components/totals-client";

export const metadata = { title: "Tổng hợp hao phí" };

export default async function BudgetTotalsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
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
          stage: true,
          quantity: true,
          normCode: true,
          sortRank: true,
          component: { select: { name: true, sortOrder: true } },
        },
        orderBy: [{ stage: "asc" }, { sortRank: "asc" }],
      })
    : [];

  const normCodes = Array.from(
    new Set(items.map((it) => it.normCode).filter((c): c is string => !!c)),
  );

  const norms = normCodes.length
    ? await prisma.norm.findMany({
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
    : [];

  const normsByCode = new Map(norms.map((n) => [n.code, n]));

  const aggregated = aggregateConsumption({
    budgetItems: items.map((it) => ({
      id: it.id,
      name: it.name,
      stage: it.stage,
      quantity: it.quantity,
      normCode: it.normCode,
      component: it.component,
    })),
    normsByCode,
  });

  const initialTab = ["vt", "nc", "mm"].includes(searchParams?.tab ?? "")
    ? (searchParams!.tab as "vt" | "nc" | "mm")
    : "vt";

  return (
    <TotalsClient
      projectId={project.id}
      projectName={project.name}
      projectCode={project.code}
      initialTab={initialTab}
      data={{
        materials: aggregated.materials,
        labor: aggregated.labor,
        machines: aggregated.machines,
        itemsWithoutNorm: aggregated.itemsWithoutNorm,
        itemsWithNormNoData: aggregated.itemsWithNormNoData,
        totalItems: items.length,
        itemsWithNorm: items.filter((it) => it.normCode).length,
      }}
    />
  );
}
