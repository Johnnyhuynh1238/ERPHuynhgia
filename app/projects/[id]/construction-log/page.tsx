import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { ConstructionLogClient } from "./_components/construction-log-client";

export default async function ProjectConstructionLogPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { from?: string; to?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role === UserRole.accountant) {
    redirect(`/projects/${params.id}?denied=1`);
  }

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: {
      id: true,
      code: true,
      name: true,
      goLiveDate: true,
    },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  return (
    <ConstructionLogClient
      project={{
        id: project.id,
        code: project.code,
        name: project.name,
        goLiveDate: project.goLiveDate?.toISOString() || null,
      }}
      initialFrom={searchParams?.from || ""}
      initialTo={searchParams?.to || ""}
      canExportPdf
      canExportXlsx
    />
  );
}
