import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditBudget, canLockBudget, canProposeAmendment, canApproveAmendment, canViewBudget } from "@/lib/project-budget";
import { ProjectBudgetClient } from "./_components/project-budget-client";

export const metadata = { title: "Dự toán công trình" };

export default async function ProjectBudgetPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  if (!canViewBudget({ id: user.id, role: user.role })) {
    redirect(`/projects/${params.id}?denied=budget`);
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true, customerName: true, contractValue: true, profitMarginPct: true },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  return (
    <ProjectBudgetClient
      projectId={project.id}
      projectName={project.name}
      contractValue={project.contractValue ? Number(project.contractValue) : null}
      profitMarginPct={project.profitMarginPct ? Number(project.profitMarginPct) : null}
      canEdit={canEditBudget({ id: user.id, role: user.role })}
      canLock={canLockBudget({ id: user.id, role: user.role })}
      canPropose={canProposeAmendment({ id: user.id, role: user.role })}
      canApprove={canApproveAmendment({ id: user.id, role: user.role })}
      currentUserRole={user.role as UserRole}
    />
  );
}
