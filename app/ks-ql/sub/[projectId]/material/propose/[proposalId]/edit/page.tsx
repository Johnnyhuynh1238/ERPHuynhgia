import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { EditProposeForm, type PrefillCard } from "./_components/edit-propose-form";

export const dynamic = "force-dynamic";

function toPrefill(parsed: unknown): PrefillCard[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((raw: any) => {
      const name = (raw?.name ?? raw?.ten ?? "") as string;
      const unit = (raw?.unit ?? raw?.dvt ?? "") as string;
      const qty = Number(raw?.qty ?? raw?.sl ?? 0);
      const task = (raw?.task ?? "") as string;
      return {
        cid: crypto.randomUUID(),
        name: name.trim(),
        qty: qty > 0 ? String(qty) : "",
        unit: unit.trim(),
        task: task.trim(),
      };
    })
    .filter((c) => c.name);
}

export default async function EditSubProposalPage({
  params,
}: {
  params: { projectId: string; proposalId: string };
}) {
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

  const proposal = await prisma.materialProposal.findFirst({
    where: { id: params.proposalId, projectId: project.id, ksId: user.id },
    select: {
      id: true,
      status: true,
      parsedItems: true,
      processedNote: true,
    },
  });
  if (!proposal) notFound();
  if (proposal.status !== "declined") {
    redirect(`/ks-ql/sub/${project.id}/material/propose/${proposal.id}`);
  }

  const prefill = toPrefill(proposal.parsedItems);

  return (
    <EditProposeForm
      projectId={project.id}
      projectName={project.name}
      proposalId={proposal.id}
      declineNote={proposal.processedNote}
      prefill={prefill}
    />
  );
}
