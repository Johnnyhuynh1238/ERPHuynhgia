import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { BudgetPlanClient } from "./_components/budget-plan-client";

export const metadata = { title: "Ngân sách dự án" };
export const dynamic = "force-dynamic";

export default async function ProjectBudgetPlanPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect(`/projects/${params.id}?denied=budget-plan`);
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true, contractValue: true },
  });
  if (!project) notFound();

  return (
    <BudgetPlanClient
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      canLock={user.role === UserRole.admin}
    />
  );
}
