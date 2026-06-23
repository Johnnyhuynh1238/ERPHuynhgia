import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { ProjectHubClient } from "./_components/project-hub-client";

export const dynamic = "force-dynamic";

export default async function KsQlProjectHubPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  const access = buildProjectAccessWhere({ id: user.id, role: user.role });
  const project = await prisma.project.findFirst({
    where: { id: params.id, ...access },
    select: {
      id: true,
      code: true,
      name: true,
      customerName: true,
      address: true,
      status: true,
      startDate: true,
      plannedDeadline: true,
      expectedEndDate: true,
    },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!exists) notFound();
    redirect("/ks-ql/projects?denied=1");
  }

  const phases = await prisma.projectPhase.findMany({
    where: { projectId: project.id },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      plannedStartDate: true,
      plannedEndDate: true,
      tasks: {
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          plannedEndDate: true,
        },
        orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
      },
    },
  });

  return (
    <ProjectHubClient
      project={{
        id: project.id,
        code: project.code,
        name: project.name,
        customerName: project.customerName,
        address: project.address,
        status: project.status,
        startDate: project.startDate.toISOString(),
        plannedDeadline: project.plannedDeadline ? project.plannedDeadline.toISOString() : null,
        expectedEndDate: project.expectedEndDate.toISOString(),
      }}
      phases={phases.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        plannedStartDate: p.plannedStartDate.toISOString(),
        plannedEndDate: p.plannedEndDate.toISOString(),
        tasks: p.tasks.map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          status: t.status,
          plannedEndDate: t.plannedEndDate ? t.plannedEndDate.toISOString() : null,
        })),
      }))}
      currentRole={user.role}
    />
  );
}
