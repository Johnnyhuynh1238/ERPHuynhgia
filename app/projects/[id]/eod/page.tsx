import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canApproveOutput, canEditEod, canViewEod } from "@/lib/eod";
import { canTickQcCheck } from "@/lib/qc-mapping";
import { EodClient } from "./_components/eod-client";

export const metadata = { title: "Cuối ngày" };

export default async function EodPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  if (!canViewEod({ id: user.id, role: user.role })) {
    redirect(`/projects/${params.id}?denied=eod`);
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

  return (
    <EodClient
      projectId={project.id}
      canEdit={canEditEod({ id: user.id, role: user.role })}
      canTickQc={canTickQcCheck({ id: user.id, role: user.role })}
      canApproveOutput={canApproveOutput({ id: user.id, role: user.role })}
    />
  );
}
