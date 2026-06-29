import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ProposeForm } from "./_components/propose-form";

export const dynamic = "force-dynamic";

export default async function ProposeNewPage({ params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      laborMode: "subcontract",
      memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
    },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  return <ProposeForm projectId={project.id} projectName={project.name} />;
}
