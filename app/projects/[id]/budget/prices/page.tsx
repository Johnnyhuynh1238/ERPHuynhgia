import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditBudget, canViewBudget } from "@/lib/project-budget";
import { PricesClient } from "./_components/prices-client";

export const metadata = { title: "Đơn giá VT/NC/MM" };

export default async function BudgetPricesPage({
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

  const initialTab = ["vt", "nc", "mm"].includes(searchParams?.tab ?? "")
    ? (searchParams!.tab as "vt" | "nc" | "mm")
    : "vt";

  return (
    <PricesClient
      projectId={project.id}
      canEdit={canEditBudget({ id: user.id, role: user.role })}
      initialTab={initialTab}
    />
  );
}
