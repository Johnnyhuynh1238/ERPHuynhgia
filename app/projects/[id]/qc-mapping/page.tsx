import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canConfigQcChecklist, parseQcChecklist } from "@/lib/qc-mapping";
import { isPhaseCode } from "@/lib/project-budget";
import { QcMappingClient } from "./_components/qc-mapping-client";

export const metadata = { title: "QC Mapping" };

export default async function QcMappingPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (!canConfigQcChecklist({ id: user.id, role: user.role })) {
    redirect(`/projects/${params.id}?denied=qc-mapping`);
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

  const items = await prisma.projectBudgetItem.findMany({
    where: { budget: { projectId: params.id }, category: "labor" },
    select: { id: true, phaseCode: true, name: true, unit: true, qcChecklist: true, sortRank: true },
    orderBy: [{ phaseCode: "asc" }, { sortRank: "asc" }],
  });

  return (
    <QcMappingClient
      projectId={project.id}
      items={items
        .filter((it) => isPhaseCode(it.phaseCode))
        .map((it) => ({
          id: it.id,
          phaseCode: it.phaseCode as "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09",
          name: it.name,
          unit: it.unit,
          qcChecklist: parseQcChecklist(it.qcChecklist),
        }))}
    />
  );
}
