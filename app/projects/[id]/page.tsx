import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { ProjectInfoClient } from "./_components/project-info-client";

export default async function ProjectInfoPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  const accessWhere = buildProjectAccessWhere({ id: user.id, role: user.role });

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...accessWhere,
    },
    include: {
      projectManager: {
        select: { id: true, fullName: true, email: true },
      },
      mainEngineer: {
        select: { id: true, fullName: true, email: true },
      },
    },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  const [admins, engineers] = await Promise.all([
    prisma.user.findMany({
      where: { role: UserRole.admin, isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.user.findMany({
      where: { role: UserRole.engineer, isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const canViewFinancial = user.role === UserRole.admin || user.role === UserRole.accountant;

  return (
    <ProjectInfoClient
      project={JSON.parse(
        JSON.stringify(
          canViewFinancial
            ? project
            : {
                ...project,
                unitPrice: null,
                contractValue: null,
              },
        ),
      )}
      admins={admins}
      engineers={engineers}
      isAdmin={user.role === UserRole.admin}
      canViewFinancial={canViewFinancial}
    />
  );
}
