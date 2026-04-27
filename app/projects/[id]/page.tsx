import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { ProjectInfoClient } from "./_components/project-info-client";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
}

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

  const today = startOfTodayUtc();
  const todaySiteRest = await prisma.siteRestDay.findUnique({
    where: {
      projectId_restDate: {
        projectId: params.id,
        restDate: today,
      },
    },
    select: {
      id: true,
      restDate: true,
      reason: true,
      note: true,
      createdAt: true,
      declaredByUser: {
        select: {
          id: true,
          fullName: true,
        },
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
      isConstructionManager={user.role === UserRole.construction_manager}
      canViewFinancial={canViewFinancial}
      currentUserRole={user.role}
      currentUserId={user.id}
      todaySiteRest={todaySiteRest ? JSON.parse(JSON.stringify(todaySiteRest)) : null}
    />
  );
}
