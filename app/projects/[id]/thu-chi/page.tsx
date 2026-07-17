import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ProjectCashLedgerClient } from "./_components/project-cash-ledger-client";

export const metadata = { title: "Thu chi dự án" };

export default async function ProjectThuChiPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect(`/projects/${params.id}?denied=thu-chi`);
  }

  const [project, categories] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, code: true, name: true, address: true },
    }),
    prisma.expenseCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true },
    }),
  ]);
  if (!project) notFound();

  return (
    <ProjectCashLedgerClient
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      projectAddress={project.address}
      categories={categories}
    />
  );
}
