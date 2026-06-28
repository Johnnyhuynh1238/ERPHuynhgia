import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditBudget, canViewBudget } from "@/lib/project-budget";
import { BudgetHubClient } from "./_components/budget-hub-client";

export const metadata = { title: "Dự toán công trình" };

export default async function ProjectBudgetHubPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  if (!canViewBudget({ id: user.id, role: user.role })) {
    redirect(`/projects/${params.id}?denied=budget`);
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true, contractValue: true, profitMarginPct: true },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  const [
    catalogTaskCount,
    quantityCount,
    normCount,
    budget,
  ] = await Promise.all([
    prisma.standardTaskCatalog.count({ where: { retiredAt: null } }),
    prisma.projectBudgetQuantity.count({ where: { projectId: project.id } }),
    prisma.projectBudgetNorm.count({ where: { projectId: project.id } }),
    prisma.projectBudget.findUnique({
      where: { projectId: project.id },
      select: { totalLabor: true, totalMaterial: true, totalEquipment: true, totalAmount: true },
    }),
  ]);

  return (
    <BudgetHubClient
      projectId={project.id}
      projectName={project.name}
      projectCode={project.code}
      contractValue={project.contractValue ? Number(project.contractValue) : null}
      profitMarginPct={project.profitMarginPct ? Number(project.profitMarginPct) : null}
      canEdit={canEditBudget({ id: user.id, role: user.role })}
      catalogTaskCount={catalogTaskCount}
      quantityCount={quantityCount}
      normCount={normCount}
      totalLabor={budget ? Number(budget.totalLabor) : 0}
      totalMaterial={budget ? Number(budget.totalMaterial) : 0}
      totalEquipment={budget ? Number(budget.totalEquipment) : 0}
      totalAmount={budget ? Number(budget.totalAmount) : 0}
    />
  );
}
