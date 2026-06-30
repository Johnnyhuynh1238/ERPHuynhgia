import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout } from "@/app/ks-ql/sub/_components/sub-layout";
import { SubProposalDetail } from "./_components/sub-proposal-detail";

export const dynamic = "force-dynamic";

export default async function SubProposalDetailPage({
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
    select: { id: true, name: true, code: true },
  });
  if (!project) notFound();

  const proposal = await prisma.materialProposal.findFirst({
    where: { id: params.proposalId, projectId: project.id, ksId: user.id },
    select: {
      id: true,
      description: true,
      status: true,
      orderStatus: true,
      parsedItems: true,
      processedNote: true,
      createdAt: true,
      acceptedAt: true,
      orderedAt: true,
      receivedAt: true,
      paidAt: true,
    },
  });
  if (!proposal) notFound();

  return (
    <SubLayout
      title="Chi tiết đề xuất"
      subtitle={project.name}
      backHref={`/ks-ql/sub/${project.id}/material/propose`}
    >
      <SubProposalDetail
        projectId={project.id}
        proposal={{
          id: proposal.id,
          description: proposal.description,
          status: proposal.status,
          orderStatus: proposal.orderStatus,
          parsedItems: proposal.parsedItems as unknown as Array<Record<string, unknown>> | null,
          processedNote: proposal.processedNote,
          createdAt: proposal.createdAt.toISOString(),
          acceptedAt: proposal.acceptedAt?.toISOString() ?? null,
          orderedAt: proposal.orderedAt?.toISOString() ?? null,
          receivedAt: proposal.receivedAt?.toISOString() ?? null,
          paidAt: proposal.paidAt?.toISOString() ?? null,
        }}
      />
    </SubLayout>
  );
}
